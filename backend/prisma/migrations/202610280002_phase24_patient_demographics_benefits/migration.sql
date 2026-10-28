-- Phase 2.4: actor-scoped demographics, emergency identity, benefits and preferences.
-- Trusted providers are preferences, never clinical consent or EHR authorization.
BEGIN;

-- NOT VALID preserves previously imported rows for explicit later reconciliation.
-- PostgreSQL nevertheless enforces these checks on every new or changed row.
ALTER TABLE public.patient_benefits ADD CONSTRAINT patient_benefits_source_check
 CHECK (source IN ('government','employer','personal')) NOT VALID;
ALTER TABLE public.patient_benefits ADD CONSTRAINT patient_benefits_coverage_nonnegative
 CHECK (coverage_amount IS NULL OR (coverage_amount >= 0 AND coverage_amount <> 'NaN'::numeric)) NOT VALID;
ALTER TABLE public.patient_benefits ADD CONSTRAINT patient_benefits_room_rent_nonnegative
 CHECK (room_rent_limit IS NULL OR (room_rent_limit >= 0 AND room_rent_limit <> 'NaN'::numeric)) NOT VALID;
ALTER TABLE public.patient_benefits ADD CONSTRAINT patient_benefits_validity_order
 CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from) NOT VALID;

-- Private ownership gate. Lock the user before its patient row, matching reviewed
-- authentication lock order. NO KEY UPDATE serializes patches without blocking FK reads.
CREATE FUNCTION public.mediid_patient_scope(p_actor uuid,p_write boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_uid text; v_patient uuid;
BEGIN
 SELECT u.uid INTO v_uid FROM public.users u
  WHERE u.id=p_actor AND u.is_active AND u.role='patient' FOR SHARE;
 IF NOT FOUND OR v_uid IS NULL THEN RAISE EXCEPTION 'PATIENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 IF p_write THEN
  SELECT p.id INTO v_patient FROM public.patients p
   WHERE p.user_id=p_actor AND p.uid=v_uid FOR NO KEY UPDATE;
 ELSE
  SELECT p.id INTO v_patient FROM public.patients p
   WHERE p.user_id=p_actor AND p.uid=v_uid FOR SHARE;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'PATIENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 RETURN v_patient;
END $$;

-- Private flat-patch validator. Plaintext Aadhaar has no accepted field; only the
-- application-generated HMAC digest, or explicit NULL, can enter aadhaar_hash.
CREATE FUNCTION public.mediid_patient_profile_patch(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_map jsonb='{"firstName":"first_name","lastName":"last_name","dateOfBirth":"date_of_birth","gender":"gender","phone":"phone","street":"street","city":"city","state":"state","pincode":"pincode","country":"country","profilePhotoUrl":"profile_photo_url","bloodGroup":"blood_group","emergencyContactName":"emergency_contact_name","emergencyContactPhone":"emergency_contact_phone","emergencyContactRelation":"emergency_contact_relation","organDonor":"organ_donor","qrActive":"qr_active","aadhaarHash":"aadhaar_hash"}';
 v_key text; v_value jsonb; v_text text; v_max integer; v_result jsonb='{}'; v_date date;
BEGIN
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>262144
 THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
 FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_input) LOOP
  IF NOT (v_map ? v_key) THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
  IF v_value='null'::jsonb THEN
   IF v_key IN ('firstName','lastName','organDonor','qrActive')
   THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
  ELSIF v_key IN ('organDonor','qrActive') THEN
   IF jsonb_typeof(v_value)<>'boolean' THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
  ELSE
   IF jsonb_typeof(v_value)<>'string' THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
   v_text=v_value#>>'{}';
   v_max=CASE WHEN v_key='profilePhotoUrl' THEN 200000 WHEN v_key='street' THEN 255
    WHEN v_key IN ('phone','emergencyContactPhone') THEN 32 WHEN v_key='pincode' THEN 20
    WHEN v_key='emergencyContactRelation' THEN 50 WHEN v_key='aadhaarHash' THEN 64
    WHEN v_key='dateOfBirth' THEN 10 WHEN v_key='gender' THEN 6 WHEN v_key='bloodGroup' THEN 3 ELSE 100 END;
   IF length(v_text)>v_max OR v_text ~ '[[:cntrl:]]'
    OR (v_key IN ('firstName','lastName') AND btrim(v_text)='')
   THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
   IF (v_key='gender' AND v_text NOT IN ('male','female','other'))
    OR (v_key='bloodGroup' AND v_text NOT IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'))
    OR (v_key='aadhaarHash' AND v_text !~ '^[0-9a-f]{64}$')
   THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
   IF v_key='dateOfBirth' THEN
    IF v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
    BEGIN v_date=v_text::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow
     THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001';
    END;
    IF to_char(v_date,'YYYY-MM-DD')<>v_text OR v_date>CURRENT_DATE
    THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
   END IF;
  END IF;
  v_result=v_result||jsonb_build_object(v_map->>v_key,v_value);
 END LOOP;
 RETURN v_result;
END $$;

CREATE FUNCTION public.mediid_get_patient_profile(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_patient uuid; v_result jsonb;
BEGIN
 v_patient=public.mediid_patient_scope(p_actor,false);
 SELECT jsonb_build_object(
  'id',p.id,'uid',p.uid,'first_name',p.first_name,'last_name',p.last_name,
  'date_of_birth',p.date_of_birth,'gender',p.gender,'phone',p.phone,'profile_photo_url',p.profile_photo_url,
  'street',p.street,'city',p.city,'state',p.state,'pincode',p.pincode,'country',p.country,
  'blood_group',p.blood_group,'aadhaar_present',p.aadhaar_hash IS NOT NULL,'organ_donor',p.organ_donor,
  'emergency_contact_name',p.emergency_contact_name,'emergency_contact_phone',p.emergency_contact_phone,
  'emergency_contact_relation',p.emergency_contact_relation,'qr_active',p.qr_active,
  'created_at',p.created_at,'updated_at',p.updated_at,'email',u.email,'legacy_id',l.patient_mongo_id)
 INTO v_result FROM public.patients p JOIN public.users u ON u.id=p.user_id
 LEFT JOIN public.auth_legacy_links l ON l.user_id=u.id WHERE p.id=v_patient;
 RETURN v_result;
END $$;

CREATE FUNCTION public.mediid_update_patient_profile(p_actor uuid,p_patch jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_patient uuid; v_row public.patients; v_patch jsonb; v_legacy text; v_identity text;
BEGIN
 v_patient=public.mediid_patient_scope(p_actor,true);
 v_patch=public.mediid_patient_profile_patch(p_patch);
 SELECT * INTO v_row FROM public.patients WHERE id=v_patient;
 v_row=jsonb_populate_record(v_row,v_patch);
 UPDATE public.patients SET first_name=v_row.first_name,last_name=v_row.last_name,
  date_of_birth=v_row.date_of_birth,gender=v_row.gender,phone=v_row.phone,profile_photo_url=v_row.profile_photo_url,
  street=v_row.street,city=v_row.city,state=v_row.state,pincode=v_row.pincode,country=v_row.country,
  blood_group=v_row.blood_group,aadhaar_hash=v_row.aadhaar_hash,organ_donor=v_row.organ_donor,
  emergency_contact_name=v_row.emergency_contact_name,emergency_contact_phone=v_row.emergency_contact_phone,
  emergency_contact_relation=v_row.emergency_contact_relation,qr_active=v_row.qr_active,
  updated_at=clock_timestamp() WHERE id=v_patient;
 SELECT patient_mongo_id INTO v_legacy FROM public.auth_legacy_links WHERE user_id=p_actor;
 v_identity=CASE WHEN v_legacy ~ '^[0-9a-f]{24}$' THEN v_legacy ELSE v_patient::text END;
 -- Rebuild from the explicit presentation allowlist, never merge an arbitrary
 -- historical JSON object containing health information or sensitive identifiers.
 INSERT INTO public.auth_profiles(user_id,profile_kind,public_uid,legacy_profile_id,safe_profile)
 VALUES(p_actor,'patient',v_row.uid,CASE WHEN v_legacy ~ '^[0-9a-f]{24}$' THEN v_legacy ELSE NULL END,
  jsonb_build_object('_id',v_identity,'id',v_identity,'uid',v_row.uid,
   'firstName',v_row.first_name,'lastName',v_row.last_name,'phone',v_row.phone))
 ON CONFLICT(user_id) DO UPDATE SET profile_kind='patient',public_uid=EXCLUDED.public_uid,
  legacy_profile_id=EXCLUDED.legacy_profile_id,safe_profile=EXCLUDED.safe_profile;
 RETURN v_patient;
END $$;

-- Narrow public read: no actor, UUID, phone/email, dates, address, hash, benefits,
-- preferences or clinical data can be selected through this function.
CREATE FUNCTION public.mediid_patient_emergency_card(p_uid text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_result jsonb;
BEGIN
 IF p_uid IS NULL OR p_uid !~ '^MID-[A-Z0-9]{8}$' THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('uid',p.uid,'name',concat_ws(' ',p.first_name,p.last_name),
  'emergency',jsonb_build_object('bloodGroup',p.blood_group,
   'emergencyContactName',p.emergency_contact_name,'emergencyContactPhone',p.emergency_contact_phone,
   'emergencyContactRelation',p.emergency_contact_relation,'organDonor',p.organ_donor))
 INTO v_result FROM public.patients p JOIN public.users u ON u.id=p.user_id
 WHERE p.uid=p_uid AND u.uid=p.uid AND u.is_active AND u.role='patient' AND p.qr_active;
 RETURN v_result;
END $$;

-- Benefit values are bounded before conversion. Financial inputs must be decimal
-- strings: PostgreSQL numeric performs persistence, without a floating-point round-trip.
CREATE FUNCTION public.mediid_patient_benefit_patch(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_map jsonb='{"source":"source","type":"type","schemeName":"scheme_name","cardNumber":"card_number","policyNumber":"policy_number","beneficiaryName":"beneficiary_name","employerName":"employer_name","employeeId":"employee_id","designation":"designation","insurerName":"insurer_name","tpaName":"tpa_name","tpaPhone":"tpa_phone","coverageAmount":"coverage_amount","roomRentLimit":"room_rent_limit","familyCovered":"family_covered","familyMembers":"family_members","validFrom":"valid_from","validUntil":"valid_until","hospitalNetwork":"hospital_network","claimProcess":"claim_process","helplineNumber":"helpline_number","notes":"notes"}';
 v_key text; v_value jsonb; v_text text; v_max integer; v_result jsonb='{}'; v_date date;
BEGIN
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>65536
 THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
 FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_input) LOOP
  IF NOT (v_map ? v_key) THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
  IF v_value='null'::jsonb THEN
   IF v_key IN ('source','type','familyCovered','familyMembers')
   THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
  ELSIF v_key='familyCovered' THEN
   IF jsonb_typeof(v_value)<>'boolean' THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
  ELSIF v_key='familyMembers' THEN
   IF jsonb_typeof(v_value)<>'array' THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
   IF jsonb_array_length(v_value)>50 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_value) x
    WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>100
     OR btrim(x#>>'{}')='' OR (x#>>'{}') ~ '[[:cntrl:]]')
   THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
  ELSE
   IF jsonb_typeof(v_value)<>'string' THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
   v_text=v_value#>>'{}';
   v_max=CASE WHEN v_key IN ('hospitalNetwork','claimProcess','notes') THEN 4000
    WHEN v_key IN ('cardNumber','policyNumber') THEN 128 WHEN v_key IN ('type','employeeId') THEN 64
    WHEN v_key='designation' THEN 100 WHEN v_key IN ('source','tpaPhone','helplineNumber') THEN 32
    WHEN v_key IN ('validFrom','validUntil') THEN 10
    WHEN v_key IN ('coverageAmount','roomRentLimit') THEN 13 ELSE 255 END;
   IF length(v_text)>v_max OR v_text ~ '[[:cntrl:]]'
    OR (v_key IN ('source','type') AND btrim(v_text)='')
   THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
   IF (v_key='coverageAmount' AND v_text !~ '^(0|[1-9][0-9]{0,9})([.][0-9]{1,2})?$')
    OR (v_key='roomRentLimit' AND v_text !~ '^(0|[1-9][0-9]{0,7})([.][0-9]{1,2})?$')
   THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
   IF v_key IN ('validFrom','validUntil') THEN
    IF v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
    BEGIN v_date=v_text::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow
     THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001';
    END;
    IF to_char(v_date,'YYYY-MM-DD')<>v_text THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
   END IF;
  END IF;
  v_result=v_result||jsonb_build_object(v_map->>v_key,v_value);
 END LOOP;
 RETURN v_result;
END $$;

CREATE FUNCTION public.mediid_list_patient_benefits(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_patient uuid; v_result jsonb;
BEGIN
 v_patient=public.mediid_patient_scope(p_actor,false);
 SELECT coalesce(jsonb_agg((to_jsonb(b)-'patient_id')||jsonb_build_object(
  'coverage_amount',b.coverage_amount::text,'room_rent_limit',b.room_rent_limit::text)
  ORDER BY b.created_at DESC,b.id),'[]'::jsonb) INTO v_result
 FROM public.patient_benefits b WHERE b.patient_id=v_patient AND b.is_active;
 RETURN v_result;
END $$;

CREATE FUNCTION public.mediid_save_patient_benefit(p_actor uuid,p_benefit uuid,p_patch jsonb,p_create boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_patient uuid; v_row public.patient_benefits; v_patch jsonb;
BEGIN
 v_patient=public.mediid_patient_scope(p_actor,true);
 IF p_benefit IS NULL OR p_create IS NULL
 THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
 v_patch=public.mediid_patient_benefit_patch(p_patch);
 IF p_create THEN
  IF NOT (v_patch ? 'source') OR NOT (v_patch ? 'type')
  THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
  v_row.id=p_benefit; v_row.patient_id=v_patient; v_row.family_covered=false;
  v_row.family_members='{}'; v_row.is_active=true; v_row.created_at=clock_timestamp();
 ELSE
  SELECT * INTO v_row FROM public.patient_benefits
   WHERE id=p_benefit AND patient_id=v_patient AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PATIENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 END IF;
 v_row=jsonb_populate_record(v_row,v_patch);
 IF NOT ((v_row.source='government' AND v_row.type IN ('ayushman','esi','cghs','state','other_govt'))
  OR (v_row.source='employer' AND v_row.type IN ('group_mediclaim','corporate_insurance','esic_employer','other_employer'))
  OR (v_row.source='personal' AND v_row.type IN ('individual_insurance','family_floater','top_up','other_personal')))
  OR (v_row.valid_from IS NOT NULL AND v_row.valid_until IS NOT NULL AND v_row.valid_until<v_row.valid_from)
 THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
 IF p_create THEN
  INSERT INTO public.patient_benefits SELECT (v_row).*;
 ELSE
  UPDATE public.patient_benefits SET source=v_row.source,type=v_row.type,scheme_name=v_row.scheme_name,
   card_number=v_row.card_number,policy_number=v_row.policy_number,beneficiary_name=v_row.beneficiary_name,
   employer_name=v_row.employer_name,employee_id=v_row.employee_id,designation=v_row.designation,
   insurer_name=v_row.insurer_name,tpa_name=v_row.tpa_name,tpa_phone=v_row.tpa_phone,
   coverage_amount=v_row.coverage_amount,room_rent_limit=v_row.room_rent_limit,
   family_covered=v_row.family_covered,family_members=v_row.family_members,
   valid_from=v_row.valid_from,valid_until=v_row.valid_until,hospital_network=v_row.hospital_network,
   claim_process=v_row.claim_process,helpline_number=v_row.helpline_number,notes=v_row.notes
   WHERE id=p_benefit AND patient_id=v_patient;
 END IF;
 RETURN p_benefit;
END $$;

CREATE FUNCTION public.mediid_deactivate_patient_benefit(p_actor uuid,p_benefit uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_patient uuid;
BEGIN
 v_patient=public.mediid_patient_scope(p_actor,true);
 UPDATE public.patient_benefits SET is_active=false WHERE id=p_benefit AND patient_id=v_patient;
 IF NOT FOUND THEN RAISE EXCEPTION 'PATIENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 RETURN true;
END $$;

CREATE FUNCTION public.mediid_patient_trusted_providers(p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_patient uuid;
BEGIN
 v_patient=public.mediid_patient_scope(p_actor,false);
 RETURN jsonb_build_object(
  'doctors',(SELECT coalesce(jsonb_agg(t.doctor_id ORDER BY t.doctor_id),'[]'::jsonb)
   FROM public.patient_trusted_doctors t WHERE t.patient_id=v_patient),
  'hospitals',(SELECT coalesce(jsonb_agg(t.hospital_id ORDER BY t.hospital_id),'[]'::jsonb)
   FROM public.patient_trusted_hospitals t WHERE t.patient_id=v_patient));
END $$;

CREATE FUNCTION public.mediid_set_patient_trusted_provider(p_actor uuid,p_kind text,p_target uuid,p_add boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_patient uuid; v_provider_user uuid;
BEGIN
 v_patient=public.mediid_patient_scope(p_actor,true);
 IF p_kind IS NULL OR p_kind NOT IN ('doctor','hospital') OR p_target IS NULL OR p_add IS NULL
 THEN RAISE EXCEPTION 'PATIENT_INPUT' USING ERRCODE='P0001'; END IF;
 IF p_kind='doctor' THEN
  IF p_add THEN
   SELECT d.user_id INTO v_provider_user FROM public.doctors d WHERE d.id=p_target;
   IF NOT FOUND THEN RAISE EXCEPTION 'PATIENT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
   IF v_provider_user IS NOT NULL THEN
    PERFORM 1 FROM public.users WHERE id=v_provider_user AND is_active AND role='doctor' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PATIENT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
   END IF;
   PERFORM 1 FROM public.doctors d WHERE d.id=p_target AND d.is_active
    AND d.user_id IS NOT DISTINCT FROM v_provider_user FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'PATIENT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
   INSERT INTO public.patient_trusted_doctors(patient_id,doctor_id) VALUES(v_patient,p_target)
    ON CONFLICT(patient_id,doctor_id) DO NOTHING;
  ELSE
   DELETE FROM public.patient_trusted_doctors WHERE patient_id=v_patient AND doctor_id=p_target;
  END IF;
 ELSE
  IF p_add THEN
   PERFORM 1 FROM public.hospitals WHERE id=p_target AND is_active FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'PATIENT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
   INSERT INTO public.patient_trusted_hospitals(patient_id,hospital_id) VALUES(v_patient,p_target)
    ON CONFLICT(patient_id,hospital_id) DO NOTHING;
  ELSE
   DELETE FROM public.patient_trusted_hospitals WHERE patient_id=v_patient AND hospital_id=p_target;
  END IF;
 END IF;
 RETURN true;
END $$;

-- No direct patient, benefit, preference, clinical, document or billing grants.
-- Helpers are inaccessible to both runtime and diagnostics. Only explicit entry
-- points are executable by the trusted backend runtime principal.
REVOKE ALL ON FUNCTION public.mediid_patient_scope(uuid,boolean),
 public.mediid_patient_profile_patch(jsonb),public.mediid_patient_benefit_patch(jsonb)
 FROM PUBLIC,mediid_runtime,mediid_diagnostics;
REVOKE ALL ON FUNCTION public.mediid_get_patient_profile(uuid),
 public.mediid_update_patient_profile(uuid,jsonb),public.mediid_patient_emergency_card(text),
 public.mediid_list_patient_benefits(uuid),public.mediid_save_patient_benefit(uuid,uuid,jsonb,boolean),
 public.mediid_deactivate_patient_benefit(uuid,uuid),public.mediid_patient_trusted_providers(uuid),
 public.mediid_set_patient_trusted_provider(uuid,text,uuid,boolean)
 FROM PUBLIC,mediid_diagnostics;
GRANT EXECUTE ON FUNCTION public.mediid_get_patient_profile(uuid),
 public.mediid_update_patient_profile(uuid,jsonb),public.mediid_patient_emergency_card(text),
 public.mediid_list_patient_benefits(uuid),public.mediid_save_patient_benefit(uuid,uuid,jsonb,boolean),
 public.mediid_deactivate_patient_benefit(uuid,uuid),public.mediid_patient_trusted_providers(uuid),
 public.mediid_set_patient_trusted_provider(uuid,text,uuid,boolean)
 TO mediid_runtime;
COMMIT;
