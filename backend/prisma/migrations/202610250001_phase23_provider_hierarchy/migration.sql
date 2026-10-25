-- Phase 2.3: provider hierarchy, distinct private-clinic ownership and bounded authority.
-- Historical migrations stay immutable. The runtime principal supplies an authenticated
-- actor; every sensitive function rechecks current identity and ownership in PostgreSQL.
BEGIN;

ALTER TABLE public.hospitals ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.hospitals ADD COLUMN clinic_owner_doctor_id uuid;
ALTER TABLE public.hospitals ADD CONSTRAINT hospitals_clinic_owner_doctor_id_fkey
 FOREIGN KEY (clinic_owner_doctor_id) REFERENCES public.doctors(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX hospitals_clinic_owner_doctor_id_key ON public.hospitals(clinic_owner_doctor_id);
ALTER TABLE public.hospitals ADD CONSTRAINT hospitals_distinct_owner CHECK (
 (user_id IS NOT NULL AND clinic_owner_doctor_id IS NULL) OR
 (user_id IS NULL AND clinic_owner_doctor_id IS NOT NULL AND type='clinic')
);

-- Existing admin-owned organizations retain their historical representation. No clinic,
-- including an imported admin-owned clinic, receives hospital front-desk authority.
CREATE OR REPLACE FUNCTION public.mediid_provisioning_hospital(p_actor uuid,p_hospital uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.users WHERE id=p_actor AND is_active AND role='hospital_admin' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 PERFORM 1 FROM public.hospitals WHERE id=p_hospital AND user_id=p_actor AND is_active AND type<>'clinic' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
END $$;

-- Internal allowlist/type converter. It cannot be called by runtime and performs no SQL
-- interpolation. JSON fields are mapped only to the explicitly named profile columns.
CREATE FUNCTION public.mediid_provider_patch(p_kind text,p_input jsonb,p_required text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_map jsonb; v_key text; v_value jsonb; v_text text; v_max integer; v_number numeric;
 v_result jsonb := '{}'; v_required text;
BEGIN
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>262144
 THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
 IF p_kind IN ('hospital','clinic') THEN
  v_map='{"name":"name","street":"street","city":"city","state":"state","pincode":"pincode","country":"country","latitude":"latitude","longitude":"longitude","contactPhone":"contact_phone","contactEmail":"contact_email","website":"website","emergencyPhone":"emergency_phone","specialties":"specialties","facilities":"facilities","operatingHours":"operating_hours","totalBeds":"total_beds","icuBeds":"icu_beds","logoUrl":"logo_url","photos":"photos"}';
  IF p_kind='clinic' THEN v_map=v_map||'{"registrationNumber":"registration_number"}'::jsonb; END IF;
 ELSIF p_kind='doctor' THEN
  v_map='{"firstName":"first_name","lastName":"last_name","specialization":"specialization","subSpecialties":"sub_specialties","qualifications":"qualifications","experienceYears":"experience_years","registrationNumber":"registration_number","phone":"phone","email":"email","photoUrl":"photo_url","consultationFee":"consultation_fee","expertise":"expertise","languages":"languages","status":"status"}';
 ELSIF p_kind IN ('staff','staff_create') THEN
  v_map='{"firstName":"first_name","lastName":"last_name","department":"department","employeeId":"employee_id","qualifications":"qualifications","experience":"experience","phone":"phone","email":"email","photoUrl":"photo_url","dateOfJoining":"date_of_joining","shift":"shift","status":"status"}';
  IF p_kind='staff_create' THEN v_map=v_map||'{"role":"role"}'::jsonb; END IF;
 ELSIF p_kind='template' THEN
  v_map='{"doctorId":"doctor_id","hospitalId":"hospital_id","dayOfWeek":"day_of_week","startTime":"start_time","endTime":"end_time","slotDuration":"slot_duration","channel":"channel","capacityPerSlot":"capacity_per_slot","timezone":"timezone","effectiveFrom":"effective_from","effectiveUntil":"effective_until","isActive":"is_active"}';
 ELSE RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001';
 END IF;
 FOREACH v_required IN ARRAY p_required LOOP
  IF NOT (p_input ? v_required) OR p_input->v_required='null'::jsonb
  THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
 END LOOP;
 FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_input) LOOP
  IF NOT (v_map ? v_key) THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
  IF v_value='null'::jsonb THEN
   IF v_key=ANY(ARRAY['name','firstName','lastName','specialization','role','specialties','facilities','photos','subSpecialties','qualifications','expertise','languages','consultationFee','status','dayOfWeek','startTime','endTime','slotDuration','channel','capacityPerSlot','timezone','effectiveFrom','isActive','doctorId'])
   THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
  ELSIF v_key=ANY(ARRAY['specialties','facilities','photos','subSpecialties','qualifications','expertise','languages']) THEN
   IF jsonb_typeof(v_value)<>'array' THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
   IF jsonb_array_length(v_value)>100 OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_value) x WHERE jsonb_typeof(x)<>'string'
     OR length(x#>>'{}')>CASE WHEN v_key='photos' THEN 2048 ELSE 255 END
     OR (x#>>'{}') ~ '[[:cntrl:]]')
   THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
  ELSIF v_key='operatingHours' THEN
   IF jsonb_typeof(v_value)<>'object' OR octet_length(v_value::text)>8192
   THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
  ELSIF v_key='isActive' THEN
   IF jsonb_typeof(v_value)<>'boolean' THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
  ELSIF v_key=ANY(ARRAY['experienceYears','experience','totalBeds','icuBeds','slotDuration','capacityPerSlot','latitude','longitude','consultationFee']) THEN
   IF jsonb_typeof(v_value)<>'number' THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
   v_number=(v_value#>>'{}')::numeric;
   IF (v_key='latitude' AND abs(v_number)>90) OR (v_key='longitude' AND abs(v_number)>180)
    OR (v_key='consultationFee' AND (v_number<0 OR v_number>99999999.99 OR scale(v_number)>2))
    OR (v_key=ANY(ARRAY['experienceYears','experience','totalBeds','icuBeds','slotDuration','capacityPerSlot'])
     AND (v_number<>trunc(v_number) OR v_number<0 OR v_number>100000))
    OR (v_key=ANY(ARRAY['experienceYears','experience']) AND v_number>100)
    OR (v_key='slotDuration' AND (v_number<1 OR v_number>1440))
    OR (v_key='capacityPerSlot' AND (v_number<1 OR v_number>1000))
   THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
  ELSE
   IF jsonb_typeof(v_value)<>'string' THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
   v_text=v_value#>>'{}';
   v_max=CASE WHEN v_key IN ('logoUrl','photoUrl') THEN 200000
    WHEN v_key IN ('name','street','contactEmail','email','website') THEN 255
    WHEN v_key='specialization' THEN 150 WHEN v_key='registrationNumber' AND p_kind='clinic' THEN 128
    WHEN v_key IN ('employeeId','timezone') THEN 64 WHEN v_key IN ('contactPhone','emergencyPhone','phone') THEN 32
    WHEN v_key IN ('pincode','shift','status') THEN 20 WHEN v_key='dayOfWeek' THEN 16
    WHEN v_key IN ('startTime','endTime','effectiveFrom','effectiveUntil','dateOfJoining') THEN 10
    WHEN v_key IN ('doctorId','hospitalId') THEN 36 ELSE 100 END;
   IF length(v_text)>v_max OR v_text ~ '[[:cntrl:]]'
    OR (v_key=ANY(ARRAY['name','firstName','lastName','specialization','role','dayOfWeek','startTime','endTime','timezone','channel']) AND btrim(v_text)='')
   THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
   IF (v_key='role' AND v_text NOT IN ('nurse','receptionist','lab_technician','pharmacist','ward_boy','security','administrator','radiologist','physiotherapist','other'))
    OR (v_key='status' AND p_kind='doctor' AND v_text NOT IN ('available','busy','on_leave','offline'))
    OR (v_key='status' AND p_kind IN ('staff','staff_create') AND v_text NOT IN ('active','on_leave','inactive'))
    OR (v_key='channel' AND v_text NOT IN ('ONLINE','OFFLINE','FLEXIBLE'))
    OR (v_key='dayOfWeek' AND v_text NOT IN ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'))
    OR (v_key IN ('startTime','endTime') AND v_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    OR (v_key IN ('doctorId','hospitalId') AND v_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
   THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
   IF v_key IN ('effectiveFrom','effectiveUntil','dateOfJoining') THEN
    IF v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char(v_text::date,'YYYY-MM-DD')<>v_text
    THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
   END IF;
   IF v_key='timezone' AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=v_text)
   THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
  END IF;
  v_result=v_result||jsonb_build_object(v_map->>v_key,v_value);
 END LOOP;
 RETURN v_result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001';
END $$;

CREATE FUNCTION public.mediid_update_hospital(p_actor uuid,p_hospital uuid,p_audit uuid,p_patch jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_row public.hospitals%ROWTYPE; v_patch jsonb;
BEGIN
 PERFORM 1 FROM public.users WHERE id=p_actor AND is_active AND role IN ('hospital_admin','doctor') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 -- Admin ownership and doctor-owned clinic ownership are separate branches.
 SELECT h.* INTO v_row FROM public.hospitals h WHERE h.id=p_hospital AND h.is_active AND
  ((h.user_id=p_actor AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_actor AND u.role='hospital_admin')) OR
   (h.type='clinic' AND h.clinic_owner_doctor_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.doctors d JOIN public.users u ON u.id=d.user_id WHERE d.id=h.clinic_owner_doctor_id
     AND d.user_id=p_actor AND d.is_active AND d.is_private_practice AND u.role='doctor')))
 FOR UPDATE OF h;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 v_patch=public.mediid_provider_patch('hospital',p_patch);
 v_row=jsonb_populate_record(v_row,v_patch);
 UPDATE public.hospitals SET name=v_row.name,street=v_row.street,city=v_row.city,state=v_row.state,pincode=v_row.pincode,
 country=v_row.country,latitude=v_row.latitude,longitude=v_row.longitude,contact_phone=v_row.contact_phone,
 contact_email=v_row.contact_email,website=v_row.website,emergency_phone=v_row.emergency_phone,
 specialties=v_row.specialties,facilities=v_row.facilities,operating_hours=v_row.operating_hours,
 total_beds=v_row.total_beds,icu_beds=v_row.icu_beds,logo_url=v_row.logo_url,photos=v_row.photos,updated_at=clock_timestamp()
 WHERE id=p_hospital;
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,hospital_id,details)
 VALUES(p_audit,p_actor,'provider_profile_updated',p_hospital,jsonb_build_object('fields',(SELECT jsonb_agg(key) FROM jsonb_each(p_patch))));
 RETURN p_hospital;
END $$;

CREATE FUNCTION public.mediid_create_private_clinic(
 p_actor uuid,p_hospital uuid,p_membership uuid,p_audit uuid,p_uid text,p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_doctor uuid; v_primary boolean; v_row public.hospitals%ROWTYPE; v_patch jsonb;
BEGIN
 PERFORM 1 FROM public.users WHERE id=p_actor AND is_active AND role='doctor' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 -- This row lock serializes duplicate creation on independent native connections.
 SELECT id INTO v_doctor FROM public.doctors WHERE user_id=p_actor AND is_active AND is_private_practice FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 IF EXISTS(SELECT 1 FROM public.hospitals WHERE clinic_owner_doctor_id=v_doctor)
 THEN RAISE EXCEPTION 'AUTH_CONFLICT' USING ERRCODE='P0001'; END IF;
 IF p_uid IS NULL OR p_uid !~ '^HID-[A-Z0-9]{8}$' THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
 v_patch=public.mediid_provider_patch('clinic',p_input,ARRAY['name']);
 v_row=jsonb_populate_record(NULL::public.hospitals,v_patch);
 INSERT INTO public.hospitals(id,user_id,clinic_owner_doctor_id,uid,name,registration_number,type,street,city,state,pincode,country,
  latitude,longitude,contact_phone,contact_email,website,emergency_phone,specialties,facilities,operating_hours,total_beds,icu_beds,logo_url,photos,updated_at)
 VALUES(p_hospital,NULL,v_doctor,p_uid,v_row.name,v_row.registration_number,'clinic',v_row.street,v_row.city,v_row.state,v_row.pincode,
  coalesce(v_row.country,'India'),v_row.latitude,v_row.longitude,v_row.contact_phone,v_row.contact_email,v_row.website,v_row.emergency_phone,
  coalesce(v_row.specialties,'{}'),coalesce(v_row.facilities,'{}'),v_row.operating_hours,coalesce(v_row.total_beds,0),coalesce(v_row.icu_beds,0),
  v_row.logo_url,coalesce(v_row.photos,'{}'),clock_timestamp());
 v_primary=NOT EXISTS(SELECT 1 FROM public.doctor_hospital_memberships WHERE doctor_id=v_doctor AND is_primary);
 INSERT INTO public.doctor_hospital_memberships(id,doctor_id,hospital_id,is_primary) VALUES(p_membership,v_doctor,p_hospital,v_primary);
 IF v_primary THEN UPDATE public.doctors SET primary_hospital_id=p_hospital,updated_at=clock_timestamp() WHERE id=v_doctor; END IF;
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,doctor_id,hospital_id,details)
 VALUES(p_audit,p_actor,'private_clinic_created',v_doctor,p_hospital,jsonb_build_object('membershipId',p_membership,'ownership','doctor'));
 RETURN p_hospital;
END $$;

CREATE FUNCTION public.mediid_update_doctor(p_actor uuid,p_hospital uuid,p_doctor uuid,p_audit uuid,p_patch jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_row public.doctors%ROWTYPE; v_patch jsonb;
BEGIN
 PERFORM public.mediid_provisioning_hospital(p_actor,p_hospital);
 SELECT d.* INTO v_row FROM public.doctors d LEFT JOIN public.users u ON u.id=d.user_id
 WHERE d.id=p_doctor AND d.is_active AND (d.user_id IS NULL OR (u.is_active AND u.role='doctor'))
  AND EXISTS(SELECT 1 FROM public.doctor_hospital_memberships m WHERE m.doctor_id=d.id AND m.hospital_id=p_hospital)
 FOR UPDATE OF d;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 v_patch=public.mediid_provider_patch('doctor',p_patch);
 v_row=jsonb_populate_record(v_row,v_patch);
 UPDATE public.doctors SET first_name=v_row.first_name,last_name=v_row.last_name,specialization=v_row.specialization,
  sub_specialties=v_row.sub_specialties,qualifications=v_row.qualifications,experience_years=v_row.experience_years,
  registration_number=v_row.registration_number,phone=v_row.phone,email=v_row.email,photo_url=v_row.photo_url,
  consultation_fee=v_row.consultation_fee,expertise=v_row.expertise,languages=v_row.languages,status=v_row.status,updated_at=clock_timestamp()
 WHERE id=p_doctor;
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,doctor_id,hospital_id,details)
 VALUES(p_audit,p_actor,'doctor_profile_updated',p_doctor,p_hospital,jsonb_build_object('fields',(SELECT jsonb_agg(key) FROM jsonb_each(p_patch))));
 RETURN p_doctor;
END $$;

CREATE FUNCTION public.mediid_recruit_staff(p_actor uuid,p_hospital uuid,p_staff uuid,p_audit uuid,p_input jsonb)
RETURNS TABLE(id uuid,uid text,hospital_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_row public.hospital_memberships%ROWTYPE; v_patch jsonb; v_hospital_uid text; v_sequence integer; v_uid text; v_code text;
BEGIN
 PERFORM public.mediid_provisioning_hospital(p_actor,p_hospital);
 v_patch=public.mediid_provider_patch('staff_create',p_input,ARRAY['firstName','lastName','role']);
 v_row=jsonb_populate_record(NULL::public.hospital_memberships,v_patch);
 UPDATE public.hospitals SET staff_sequence=staff_sequence+1,updated_at=clock_timestamp() WHERE hospitals.id=p_hospital
 RETURNING hospitals.uid,staff_sequence INTO v_hospital_uid,v_sequence;
 v_code=CASE v_row.role WHEN 'nurse' THEN 'NUR' WHEN 'lab_technician' THEN 'LAB' WHEN 'pharmacist' THEN 'PHR'
  WHEN 'receptionist' THEN 'REC' WHEN 'radiologist' THEN 'RAD' WHEN 'administrator' THEN 'ADM' ELSE 'STF' END;
 v_uid=v_hospital_uid||'-'||v_code||'-'||lpad(v_sequence::text,greatest(4,length(v_sequence::text)),'0');
 INSERT INTO public.hospital_memberships(id,hospital_id,uid,first_name,last_name,role,department,employee_id,
  qualifications,experience,phone,email,photo_url,date_of_joining,shift,status)
 VALUES(p_staff,p_hospital,v_uid,v_row.first_name,v_row.last_name,v_row.role,v_row.department,v_row.employee_id,
  coalesce(v_row.qualifications,'{}'),v_row.experience,v_row.phone,v_row.email,v_row.photo_url,v_row.date_of_joining,
  coalesce(v_row.shift,'morning'),coalesce(v_row.status,'active'));
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,hospital_id,staff_id,details)
 VALUES(p_audit,p_actor,'staff_recruited',p_hospital,p_staff,jsonb_build_object('role',v_row.role));
 RETURN QUERY SELECT p_staff,v_uid,p_hospital;
END $$;

CREATE FUNCTION public.mediid_update_staff(p_actor uuid,p_hospital uuid,p_staff uuid,p_audit uuid,p_patch jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_row public.hospital_memberships%ROWTYPE; v_patch jsonb;
BEGIN
 PERFORM public.mediid_provisioning_hospital(p_actor,p_hospital);
 SELECT s.* INTO v_row FROM public.hospital_memberships s WHERE s.id=p_staff AND s.hospital_id=p_hospital AND s.is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 v_patch=public.mediid_provider_patch('staff',p_patch);
 v_row=jsonb_populate_record(v_row,v_patch);
 UPDATE public.hospital_memberships SET first_name=v_row.first_name,last_name=v_row.last_name,department=v_row.department,
  employee_id=v_row.employee_id,qualifications=v_row.qualifications,experience=v_row.experience,phone=v_row.phone,email=v_row.email,
  photo_url=v_row.photo_url,date_of_joining=v_row.date_of_joining,shift=v_row.shift,status=v_row.status WHERE id=p_staff;
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,hospital_id,staff_id,details)
 VALUES(p_audit,p_actor,'staff_profile_updated',p_hospital,p_staff,jsonb_build_object('fields',(SELECT jsonb_agg(key) FROM jsonb_each(p_patch))));
 RETURN p_staff;
END $$;

CREATE FUNCTION public.mediid_deactivate_staff(p_actor uuid,p_hospital uuid,p_staff uuid,p_audit uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.mediid_provisioning_hospital(p_actor,p_hospital);
 UPDATE public.hospital_memberships SET is_active=false,status='inactive' WHERE id=p_staff AND hospital_id=p_hospital AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,hospital_id,staff_id)
 VALUES(p_audit,p_actor,'staff_deactivated',p_hospital,p_staff);
 RETURN true;
END $$;

CREATE FUNCTION public.mediid_list_staff(p_actor uuid,p_hospital uuid)
RETURNS SETOF public.hospital_memberships LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.mediid_provisioning_hospital(p_actor,p_hospital);
 RETURN QUERY SELECT s.* FROM public.hospital_memberships s WHERE s.hospital_id=p_hospital AND s.is_active
  ORDER BY s.created_at DESC,s.id LIMIT 500;
END $$;

CREATE FUNCTION public.mediid_staff_badge(p_uid text)
RETURNS TABLE(id uuid,uid text,first_name text,last_name text,role text,department text,photo_url text,hospital_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT s.id,s.uid::text,s.first_name::text,s.last_name::text,s.role::text,s.department::text,s.photo_url::text,s.hospital_id
 FROM public.hospital_memberships s JOIN public.hospitals h ON h.id=s.hospital_id
 WHERE s.uid=p_uid AND s.is_active AND h.is_active AND h.type<>'clinic'
$$;

-- Own-doctor lookup is private and shared by availability operations.
CREATE FUNCTION public.mediid_provider_doctor(p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_doctor uuid;
BEGIN
 PERFORM 1 FROM public.users WHERE id=p_actor AND is_active AND role='doctor' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 SELECT id INTO v_doctor FROM public.doctors WHERE user_id=p_actor AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 RETURN v_doctor;
END $$;

CREATE FUNCTION public.mediid_list_availability_templates(p_actor uuid)
RETURNS SETOF public.recurring_availability_templates LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_doctor uuid;
BEGIN
 v_doctor=public.mediid_provider_doctor(p_actor);
 RETURN QUERY SELECT t.* FROM public.recurring_availability_templates t WHERE t.doctor_id=v_doctor
  ORDER BY t.day_of_week,t.start_time,t.id LIMIT 1000;
END $$;

CREATE FUNCTION public.mediid_save_availability_template(p_actor uuid,p_template uuid,p_audit uuid,p_input jsonb,p_is_create boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_doctor uuid; v_row public.recurring_availability_templates%ROWTYPE; v_patch jsonb;
BEGIN
 v_doctor=public.mediid_provider_doctor(p_actor);
 IF p_is_create IS NULL THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
 IF p_is_create THEN
  v_patch=public.mediid_provider_patch('template',p_input,ARRAY['dayOfWeek','startTime','endTime','effectiveFrom']);
  v_row=jsonb_populate_record(NULL::public.recurring_availability_templates,v_patch);
  IF v_row.doctor_id IS NOT NULL AND v_row.doctor_id<>v_doctor
  THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  v_row.doctor_id=v_doctor;
  v_row.slot_duration=coalesce(v_row.slot_duration,15);
  v_row.channel=coalesce(v_row.channel,'FLEXIBLE');
  v_row.capacity_per_slot=coalesce(v_row.capacity_per_slot,1);
  v_row.timezone=coalesce(v_row.timezone,'Asia/Kolkata');
  v_row.is_active=coalesce(v_row.is_active,true);
 ELSE
  SELECT t.* INTO v_row FROM public.recurring_availability_templates t
   WHERE t.id=p_template AND t.doctor_id=v_doctor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  IF p_input ? 'doctorId' THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
  v_patch=public.mediid_provider_patch('template',p_input);
  v_row=jsonb_populate_record(v_row,v_patch);
 END IF;
 -- Membership is authoritative; primary_hospital_id never grants schedule context.
 IF v_row.hospital_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.doctor_hospital_memberships m JOIN public.hospitals h ON h.id=m.hospital_id
   WHERE m.doctor_id=v_doctor AND m.hospital_id=v_row.hospital_id AND h.is_active
    AND (h.type<>'clinic' OR h.clinic_owner_doctor_id=v_doctor))
  THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.doctors WHERE id=v_doctor AND is_private_practice)
  THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 END IF;
 IF v_row.start_time>=v_row.end_time OR (v_row.effective_until IS NOT NULL AND v_row.effective_until<v_row.effective_from)
 THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
 IF p_is_create THEN
  INSERT INTO public.recurring_availability_templates(id,doctor_id,hospital_id,day_of_week,start_time,end_time,slot_duration,
   channel,capacity_per_slot,timezone,effective_from,effective_until,is_active,updated_at)
  VALUES(p_template,v_doctor,v_row.hospital_id,v_row.day_of_week,v_row.start_time,v_row.end_time,v_row.slot_duration,
   v_row.channel,v_row.capacity_per_slot,v_row.timezone,v_row.effective_from,v_row.effective_until,v_row.is_active,clock_timestamp());
 ELSE
  UPDATE public.recurring_availability_templates SET hospital_id=v_row.hospital_id,day_of_week=v_row.day_of_week,
   start_time=v_row.start_time,end_time=v_row.end_time,slot_duration=v_row.slot_duration,channel=v_row.channel,
   capacity_per_slot=v_row.capacity_per_slot,timezone=v_row.timezone,effective_from=v_row.effective_from,
   effective_until=v_row.effective_until,is_active=v_row.is_active,updated_at=clock_timestamp() WHERE id=p_template;
 END IF;
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,doctor_id,hospital_id,details)
 VALUES(p_audit,p_actor,CASE WHEN p_is_create THEN 'availability_template_created' ELSE 'availability_template_updated' END,
  v_doctor,v_row.hospital_id,jsonb_build_object('templateId',p_template));
 RETURN p_template;
END $$;

CREATE FUNCTION public.mediid_deactivate_availability_template(p_actor uuid,p_template uuid,p_audit uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_doctor uuid; v_hospital uuid;
BEGIN
 v_doctor=public.mediid_provider_doctor(p_actor);
 UPDATE public.recurring_availability_templates SET is_active=false,updated_at=clock_timestamp()
 WHERE id=p_template AND doctor_id=v_doctor AND is_active RETURNING hospital_id INTO v_hospital;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,doctor_id,hospital_id,details)
 VALUES(p_audit,p_actor,'availability_template_deactivated',v_doctor,v_hospital,jsonb_build_object('templateId',p_template));
 RETURN true;
END $$;

-- Only required profile columns: no sequences, activation credentials, audit contents,
-- staff private records, live appointments, clinical tables, billing or payments.
GRANT SELECT(id,user_id,clinic_owner_doctor_id,uid,name,registration_number,type,street,city,state,pincode,country,latitude,longitude,
 contact_phone,contact_email,website,emergency_phone,specialties,facilities,operating_hours,total_beds,icu_beds,
 logo_url,photos,rating_average,rating_count,is_verified,is_active,created_at,updated_at) ON public.hospitals TO mediid_runtime;
GRANT SELECT(id,user_id,primary_hospital_id,uid,first_name,last_name,specialization,sub_specialties,qualifications,experience_years,
 registration_number,phone,email,photo_url,consultation_fee,expertise,languages,rating_average,rating_count,status,
 is_private_practice,is_active,created_at,updated_at) ON public.doctors TO mediid_runtime;
GRANT SELECT(id,doctor_id,hospital_id,role_title,is_primary,joined_at) ON public.doctor_hospital_memberships TO mediid_runtime;

REVOKE ALL ON FUNCTION public.mediid_provider_patch(text,jsonb,text[]),public.mediid_provider_doctor(uuid)
 FROM PUBLIC,mediid_runtime,mediid_diagnostics;
REVOKE ALL ON FUNCTION public.mediid_update_hospital(uuid,uuid,uuid,jsonb),
 public.mediid_create_private_clinic(uuid,uuid,uuid,uuid,text,jsonb),
 public.mediid_update_doctor(uuid,uuid,uuid,uuid,jsonb),
 public.mediid_recruit_staff(uuid,uuid,uuid,uuid,jsonb),
 public.mediid_update_staff(uuid,uuid,uuid,uuid,jsonb),
 public.mediid_deactivate_staff(uuid,uuid,uuid,uuid),
 public.mediid_list_staff(uuid,uuid),public.mediid_staff_badge(text),
 public.mediid_list_availability_templates(uuid),
 public.mediid_save_availability_template(uuid,uuid,uuid,jsonb,boolean),
 public.mediid_deactivate_availability_template(uuid,uuid,uuid)
 FROM PUBLIC,mediid_diagnostics;
GRANT EXECUTE ON FUNCTION public.mediid_update_hospital(uuid,uuid,uuid,jsonb),
 public.mediid_create_private_clinic(uuid,uuid,uuid,uuid,text,jsonb),
 public.mediid_update_doctor(uuid,uuid,uuid,uuid,jsonb),
 public.mediid_recruit_staff(uuid,uuid,uuid,uuid,jsonb),
 public.mediid_update_staff(uuid,uuid,uuid,uuid,jsonb),
 public.mediid_deactivate_staff(uuid,uuid,uuid,uuid),
 public.mediid_list_staff(uuid,uuid),public.mediid_staff_badge(text),
 public.mediid_list_availability_templates(uuid),
 public.mediid_save_availability_template(uuid,uuid,uuid,jsonb,boolean),
 public.mediid_deactivate_availability_template(uuid,uuid,uuid)
 TO mediid_runtime;
-- Exact owned-record reads do not depend on the bounded roster/list window.
CREATE FUNCTION public.mediid_get_staff(p_actor uuid,p_hospital uuid,p_staff uuid)
RETURNS SETOF public.hospital_memberships LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.mediid_provisioning_hospital(p_actor,p_hospital);
 RETURN QUERY SELECT s.* FROM public.hospital_memberships s
  WHERE s.id=p_staff AND s.hospital_id=p_hospital AND s.is_active;
END $$;

CREATE FUNCTION public.mediid_get_availability_template(p_actor uuid,p_template uuid)
RETURNS SETOF public.recurring_availability_templates LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_doctor uuid;
BEGIN
 v_doctor=public.mediid_provider_doctor(p_actor);
 RETURN QUERY SELECT t.* FROM public.recurring_availability_templates t WHERE t.id=p_template AND t.doctor_id=v_doctor;
END $$;

REVOKE ALL ON FUNCTION public.mediid_get_staff(uuid,uuid,uuid),public.mediid_get_availability_template(uuid,uuid)
 FROM PUBLIC,mediid_diagnostics;
GRANT EXECUTE ON FUNCTION public.mediid_get_staff(uuid,uuid,uuid),public.mediid_get_availability_template(uuid,uuid)
 TO mediid_runtime;

COMMIT;
