-- Phase 2.6: encounter-centered operational EHR. Earlier migrations are unchanged.
BEGIN;
ALTER TABLE public.allergies ADD COLUMN encounter_id uuid;
ALTER TABLE public.allergies ADD CONSTRAINT allergies_encounter_id_fkey FOREIGN KEY(encounter_id) REFERENCES public.encounters(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX allergies_encounter_id_idx ON public.allergies(encounter_id);
ALTER TABLE public.access_logs ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE public.access_logs ADD COLUMN resource_type varchar(64), ADD COLUMN resource_id uuid, ADD COLUMN purpose varchar(64), ADD COLUMN access_basis varchar(32);
ALTER TABLE public.encounters ADD CONSTRAINT encounter_time_bounds CHECK(end_time IS NULL OR end_time>=start_time);
ALTER TABLE public.clinical_notes ADD CONSTRAINT clinical_note_type_allowed CHECK(note_type IN ('progress','consultation','discharge','procedure'));
ALTER TABLE public.conditions ADD CONSTRAINT condition_status_allowed CHECK(clinical_status IN ('active','resolved'));
ALTER TABLE public.allergies ADD CONSTRAINT allergy_severity_allowed CHECK(severity IS NULL OR severity IN ('mild','moderate','severe','fatal'));
ALTER TABLE public.prescriptions ADD CONSTRAINT prescription_status_allowed CHECK(status IN ('active','dispensed','cancelled'));
ALTER TABLE public.prescription_items ADD CONSTRAINT prescription_item_quantity_positive CHECK(quantity>0);
ALTER TABLE public.access_logs ADD CONSTRAINT clinical_access_basis_allowed CHECK(access_basis IS NULL OR access_basis IN ('PATIENT_SELF','ACTIVE_CONSULTATION','NONE'));
ALTER TABLE public.access_logs ADD CONSTRAINT clinical_audit_resolved_patient CHECK(patient_id IS NOT NULL OR (status='denied' AND access_basis IS NOT DISTINCT FROM 'NONE'));
CREATE INDEX clinical_history_order ON public.encounters(patient_id,start_time DESC,id DESC);

CREATE FUNCTION public.mediid_clinical_retain_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'CLINICAL_AUDIT_IMMUTABLE' USING ERRCODE='23514'; END $$;
CREATE TRIGGER clinical_audit_retention BEFORE UPDATE OR DELETE ON public.access_logs FOR EACH ROW EXECUTE FUNCTION public.mediid_clinical_retain_audit();
CREATE TRIGGER clinical_audit_bulk_retention BEFORE TRUNCATE ON public.access_logs FOR EACH STATEMENT EXECUTE FUNCTION public.mediid_clinical_retain_audit();
CREATE FUNCTION public.mediid_clinical_allergy_context() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.encounter_id IS NOT NULL THEN
  -- A real common-parent write also serializes against patient rewrites at RR.
  UPDATE public.encounters SET start_time=start_time WHERE id=NEW.encounter_id AND patient_id=NEW.patient_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLINICAL_CONTEXT_MISMATCH' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER clinical_allergy_context BEFORE INSERT OR UPDATE ON public.allergies FOR EACH ROW EXECUTE FUNCTION public.mediid_clinical_allergy_context();
CREATE FUNCTION public.mediid_clinical_retain_allergy_context() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.patient_id IS DISTINCT FROM OLD.patient_id AND EXISTS(SELECT 1 FROM public.allergies a WHERE a.encounter_id=OLD.id AND a.patient_id IS DISTINCT FROM NEW.patient_id) THEN RAISE EXCEPTION 'CLINICAL_CONTEXT_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER clinical_retain_allergy_context BEFORE UPDATE OF patient_id ON public.encounters FOR EACH ROW EXECUTE FUNCTION public.mediid_clinical_retain_allergy_context();
CREATE FUNCTION public.mediid_clinical_completion_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status AND EXISTS(SELECT 1 FROM public.encounters e WHERE e.status='in_progress' AND (e.hospital_appointment_id=NEW.id OR e.private_clinic_appointment_id=NEW.id)) THEN RAISE EXCEPTION 'APPOINTMENT_CLINICAL_CONFLICT' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER clinical_completion_guard BEFORE UPDATE OF status ON public.hospital_appointments FOR EACH ROW EXECUTE FUNCTION public.mediid_clinical_completion_guard();
CREATE TRIGGER clinical_completion_guard BEFORE UPDATE OF status ON public.private_clinic_appointments FOR EACH ROW EXECUTE FUNCTION public.mediid_clinical_completion_guard();

CREATE FUNCTION public.mediid_clinical_text(p_value text,p_max int,p_required boolean DEFAULT false) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_value IS NULL THEN IF p_required THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF; RETURN NULL; END IF;
 IF length(p_value)>p_max OR p_value~'[[:cntrl:]]' OR (p_required AND length(trim(p_value))=0) THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
 RETURN nullif(trim(p_value),'');
END $$;
CREATE FUNCTION public.mediid_clinical_number(p_value jsonb,p_min numeric,p_max numeric,p_integer boolean DEFAULT false) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE v text; n numeric;
BEGIN
 IF p_value IS NULL OR p_value='null'::jsonb THEN RETURN NULL; END IF;
 v=p_value#>>'{}';
 IF jsonb_typeof(p_value) NOT IN ('number','string') OR v!~'^[0-9]+(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
 n=v::numeric;
 IF n<p_min OR n>p_max OR (p_integer AND n<>trunc(n)) THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
 RETURN n;
END $$;
CREATE FUNCTION public.mediid_clinical_row(p_row jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE k text; v jsonb; camel text; result jsonb='{}';
BEGIN
 IF p_row IS NULL THEN RETURN NULL; END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(p_row) LOOP
  SELECT string_agg(CASE WHEN ord=1 THEN part ELSE upper(left(part,1))||substr(part,2) END,'' ORDER BY ord) INTO camel FROM unnest(string_to_array(k,'_')) WITH ORDINALITY q(part,ord);
  IF k='file_url' THEN
   -- A reference is kept intact or redacted; truncation could invent a URL.
   IF jsonb_typeof(v)<>'string' OR length(v#>>'{}')>2048 OR (v#>>'{}')!~'^https://[^/@[:space:]]+([/:][^[:cntrl:]]*)?$' OR (v#>>'{}')~'[?#]' OR (v#>>'{}')~'^https://[^/]*@' THEN v='null'::jsonb; END IF;
  ELSIF jsonb_typeof(v)='string' THEN
   v=to_jsonb(left(v#>>'{}',CASE WHEN k IN ('subjective','objective','assessment','plan','notes') THEN 4000 WHEN k IN ('reaction','instructions','chief_complaint') THEN 2000 ELSE 4000 END));
  END IF;
  result=result||jsonb_build_object(camel,v);
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION public.mediid_clinical_document_dto(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',m.id,'encounterId',m.encounter_id,'type',m.type,'title',m.title,
 'fileUrl',CASE WHEN m.file_url~'^https://[^/@[:space:]]+([/:][^[:cntrl:]]*)?$' AND m.file_url!~'[?#]' AND m.file_url!~'^https://[^/]*@' AND length(m.file_url)<=2048 THEN m.file_url END,
 'fileName',m.file_name,'fileSizeBytes',m.file_size_bytes,'mimeType',m.mime_type,'notes',left(m.notes,2000),'hospitalName',m.hospital_name,'doctorName',m.doctor_name,'uploadedAt',m.uploaded_at)
 FROM public.medical_documents m WHERE m.id=p_id
$$;
CREATE FUNCTION public.mediid_clinical_prescription_dto(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.mediid_clinical_row(to_jsonb(p))||jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.mediid_clinical_row(to_jsonb(i)) ORDER BY i.id) FROM (SELECT * FROM public.prescription_items WHERE prescription_id=p.id ORDER BY id LIMIT 50) i),'[]'::jsonb)) FROM public.prescriptions p WHERE p.id=p_id
$$;
-- Imported child rows with mismatched patient provenance are excluded from reads;
-- this does not rewrite or repair historical clinical data.
CREATE FUNCTION public.mediid_clinical_encounter_dto(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.mediid_clinical_row(to_jsonb(e))||jsonb_build_object(
 'doctor',(SELECT jsonb_build_object('id',d.id,'uid',d.uid,'firstName',d.first_name,'lastName',d.last_name) FROM public.doctors d WHERE d.id=e.doctor_id),
 'hospital',(SELECT jsonb_build_object('id',h.id,'uid',h.uid,'name',h.name) FROM public.hospitals h WHERE h.id=e.hospital_id),
 'vitals',coalesce((SELECT jsonb_agg(public.mediid_clinical_row(to_jsonb(v)||jsonb_build_object('temperature_celsius',v.temperature_celsius::text,'weight_kg',v.weight_kg::text,'height_cm',v.height_cm::text,'bmi',v.bmi::text)) ORDER BY v.recorded_at,v.id) FROM (SELECT * FROM public.vitals WHERE encounter_id=e.id ORDER BY recorded_at,id LIMIT 20) v),'[]'::jsonb),
 'notes',coalesce((SELECT jsonb_agg(public.mediid_clinical_row(to_jsonb(n)) ORDER BY n.created_at,n.id) FROM (SELECT * FROM public.clinical_notes WHERE encounter_id=e.id ORDER BY created_at,id LIMIT 20) n),'[]'::jsonb),
 'conditions',coalesce((SELECT jsonb_agg(public.mediid_clinical_row(to_jsonb(c)) ORDER BY c.created_at,c.id) FROM (SELECT * FROM public.conditions WHERE encounter_id=e.id AND patient_id=e.patient_id ORDER BY created_at,id LIMIT 20) c),'[]'::jsonb),
 'allergies',coalesce((SELECT jsonb_agg(public.mediid_clinical_row(to_jsonb(a)) ORDER BY a.created_at,a.id) FROM (SELECT * FROM public.allergies WHERE encounter_id=e.id AND patient_id=e.patient_id ORDER BY created_at,id LIMIT 20) a),'[]'::jsonb),
 'prescriptions',coalesce((SELECT jsonb_agg(public.mediid_clinical_prescription_dto(p.id) ORDER BY p.issued_at,p.id) FROM (SELECT id,issued_at FROM public.prescriptions WHERE encounter_id=e.id AND patient_id=e.patient_id ORDER BY issued_at,id LIMIT 20) p),'[]'::jsonb),
 'documents',coalesce((SELECT jsonb_agg(public.mediid_clinical_document_dto(m.id) ORDER BY m.uploaded_at,m.id) FROM (SELECT * FROM public.medical_documents WHERE encounter_id=e.id AND patient_id=e.patient_id ORDER BY uploaded_at,id LIMIT 20) m),'[]'::jsonb))
 FROM public.encounters e WHERE e.id=p_id
$$;
CREATE FUNCTION public.mediid_clinical_bundle(p_patient uuid,p_limit int DEFAULT 20,p_cursor uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; c_time timestamptz; ids uuid[]; total int; next_id uuid;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
 IF p_cursor IS NOT NULL THEN SELECT start_time INTO c_time FROM public.encounters WHERE id=p_cursor AND patient_id=p_patient; IF NOT FOUND THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF; END IF;
 SELECT array_agg(id ORDER BY start_time DESC,id DESC) INTO ids FROM (SELECT id,start_time FROM public.encounters WHERE patient_id=p_patient AND (p_cursor IS NULL OR (start_time,id)<(c_time,p_cursor)) ORDER BY start_time DESC,id DESC LIMIT p_limit+1) e;
 total=coalesce(array_length(ids,1),0); IF total>p_limit THEN next_id=ids[p_limit]; ids=ids[1:p_limit]; END IF;
 SELECT jsonb_build_object('patient',jsonb_build_object('id',p.id,'uid',p.uid,'firstName',p.first_name,'lastName',p.last_name,'dateOfBirth',p.date_of_birth,'gender',p.gender,'bloodGroup',p.blood_group),
 'consultation',NULL,
 'encounters',coalesce((SELECT jsonb_agg(public.mediid_clinical_encounter_dto(q.id) ORDER BY q.ord) FROM unnest(ids) WITH ORDINALITY q(id,ord)),'[]'::jsonb),
 'conditions',coalesce((SELECT jsonb_agg(public.mediid_clinical_row(to_jsonb(c)) ORDER BY c.created_at DESC,c.id DESC) FROM (SELECT * FROM public.conditions WHERE patient_id=p.id AND (encounter_id IS NULL OR EXISTS(SELECT 1 FROM public.encounters context_encounter WHERE context_encounter.id=conditions.encounter_id AND context_encounter.patient_id=p.id)) ORDER BY created_at DESC,id DESC LIMIT 100) c),'[]'::jsonb),
 'allergies',coalesce((SELECT jsonb_agg(public.mediid_clinical_row(to_jsonb(a)) ORDER BY a.created_at DESC,a.id DESC) FROM (SELECT * FROM public.allergies WHERE patient_id=p.id AND (encounter_id IS NULL OR EXISTS(SELECT 1 FROM public.encounters context_encounter WHERE context_encounter.id=allergies.encounter_id AND context_encounter.patient_id=p.id)) ORDER BY created_at DESC,id DESC LIMIT 100) a),'[]'::jsonb),
 'prescriptions',coalesce((SELECT jsonb_agg(public.mediid_clinical_prescription_dto(rx.id) ORDER BY rx.issued_at DESC,rx.id DESC) FROM (SELECT id,issued_at FROM public.prescriptions WHERE patient_id=p.id AND (encounter_id IS NULL OR EXISTS(SELECT 1 FROM public.encounters context_encounter WHERE context_encounter.id=prescriptions.encounter_id AND context_encounter.patient_id=p.id)) ORDER BY issued_at DESC,id DESC LIMIT 50) rx),'[]'::jsonb),
 'documents',coalesce((SELECT jsonb_agg(public.mediid_clinical_document_dto(m.id) ORDER BY m.uploaded_at DESC,m.id DESC) FROM (SELECT * FROM public.medical_documents WHERE patient_id=p.id AND (encounter_id IS NULL OR EXISTS(SELECT 1 FROM public.encounters context_encounter WHERE context_encounter.id=medical_documents.encounter_id AND context_encounter.patient_id=p.id)) ORDER BY uploaded_at DESC,id DESC LIMIT 50) m),'[]'::jsonb),
 'pagination',jsonb_build_object('limit',p_limit,'nextCursor',next_id,'hasMore',total>p_limit,'relatedRecordLimit',100,'artifactLimit',50,'encounterArtifactLimit',20)) INTO result FROM public.patients p WHERE p.id=p_patient;
 RETURN result;
END $$;
-- Parent serialization, live provider locks and database time form the complete
-- authority. Private session tokens and future consent workflows grant nothing.
CREATE FUNCTION public.mediid_clinical_context(p_actor uuid,p_patient uuid,p_appointment uuid DEFAULT NULL,p_allow_completed boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.users; d public.doctors; s public.consultation_sessions; b jsonb; h uuid; v_id uuid; reason text; result jsonb; now_at timestamptz;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_actor FOR SHARE;
 IF u.id IS NULL OR NOT u.is_active OR u.role<>'doctor' THEN RETURN jsonb_build_object('allowed',false,'reason','doctor_required','patientId',p_patient); END IF;
 SELECT * INTO d FROM public.doctors WHERE user_id=p_actor;
 IF d.id IS NULL OR NOT d.is_active THEN RETURN jsonb_build_object('allowed',false,'reason','doctor_inactive','patientId',p_patient); END IF;
 SELECT * INTO s FROM public.consultation_sessions WHERE doctor_id=d.id AND patient_id=p_patient AND appointment_id IS NULL AND (hospital_appointment_id IS NOT NULL OR private_clinic_appointment_id IS NOT NULL) AND (p_appointment IS NULL OR hospital_appointment_id=p_appointment OR private_clinic_appointment_id=p_appointment)
 ORDER BY CASE WHEN status='active' AND starts_at<=clock_timestamp() AND clock_timestamp()<expires_at THEN 0 ELSE 1 END,starts_at DESC NULLS LAST,id DESC LIMIT 1;
 IF s.id IS NULL THEN RETURN jsonb_build_object('allowed',false,'reason','no_active_consultation','patientId',p_patient,'doctorId',d.id); END IF;
 v_id=coalesce(s.hospital_appointment_id,s.private_clinic_appointment_id);
 b=public.mediid_appointment_row(v_id,true); h=coalesce(b->>'hospital_id',b->>'clinic_hospital_id')::uuid;
 result=jsonb_build_object('allowed',false,'patientId',p_patient,'doctorId',d.id,'organizationId',h,'appointmentId',v_id,'domain',b->>'domain','sessionId',s.id,'opensAt',s.starts_at,'startsAt',s.starts_at,'expiresAt',s.expires_at);
 PERFORM 1 FROM public.hospitals WHERE id=h AND is_active FOR SHARE;
 IF NOT FOUND THEN RETURN result||jsonb_build_object('reason','provider_membership_inactive'); END IF;
 PERFORM 1 FROM public.doctors WHERE id=d.id AND user_id=p_actor AND is_active FOR SHARE;
 IF NOT FOUND THEN RETURN result||jsonb_build_object('reason','doctor_inactive'); END IF;
 PERFORM 1 FROM public.doctor_hospital_memberships WHERE doctor_id=d.id AND hospital_id=h FOR SHARE;
 IF NOT FOUND THEN RETURN result||jsonb_build_object('reason','provider_membership_inactive'); END IF;
 SELECT * INTO s FROM public.consultation_sessions WHERE id=s.id FOR UPDATE;
 IF s.appointment_id IS NOT NULL OR s.patient_id IS DISTINCT FROM p_patient OR s.doctor_id IS DISTINCT FROM d.id OR s.hospital_id IS DISTINCT FROM h OR
 (b->>'domain'='hospital' AND (s.hospital_appointment_id IS DISTINCT FROM v_id OR s.private_clinic_appointment_id IS NOT NULL)) OR
 (b->>'domain'='clinic' AND (s.private_clinic_appointment_id IS DISTINCT FROM v_id OR s.hospital_appointment_id IS NOT NULL)) THEN
  RETURN jsonb_build_object('allowed',false,'patientId',p_patient,'doctorId',d.id,'reason','consultation_inactive');
 END IF;
 result=result||jsonb_build_object('opensAt',s.starts_at,'startsAt',s.starts_at,'expiresAt',s.expires_at);
 now_at=clock_timestamp();
 IF s.doctor_id IS DISTINCT FROM d.id OR s.patient_id IS DISTINCT FROM p_patient OR s.hospital_id IS DISTINCT FROM h OR (b->>'patient_id')::uuid IS DISTINCT FROM p_patient OR (b->>'doctor_id')::uuid IS DISTINCT FROM d.id OR
 s.starts_at IS DISTINCT FROM (b->>'slot_start_time')::timestamptz-interval '10 minutes' OR s.expires_at IS DISTINCT FROM (b->>'slot_start_time')::timestamptz+interval '2 hours' OR
 b->>'slot_id' IS NULL OR b->>'legacy_source_id' IS NOT NULL OR
 NOT EXISTS(SELECT 1 FROM public.materialized_appointment_slots m WHERE m.id=(b->>'slot_id')::uuid AND m.doctor_id=d.id AND m.hospital_id=h AND m.slot_start=(b->>'slot_start_time')::timestamptz AND m.slot_end=(b->>'slot_end_time')::timestamptz) OR
 NOT EXISTS(SELECT 1 FROM public.appointment_slot_reservations r WHERE (r.hospital_appointment_id=v_id OR r.private_clinic_appointment_id=v_id) AND r.slot_id=(b->>'slot_id')::uuid AND (r.status='CONFIRMED' OR (p_allow_completed AND b->>'status'='completed' AND s.status='completed' AND r.status='RELEASED'))) THEN reason='consultation_inactive';
 ELSIF s.starts_at IS NULL OR now_at<s.starts_at THEN reason='consultation_not_started';
 ELSIF now_at>=s.expires_at THEN reason='consultation_expired';
 ELSIF NOT ((s.status='active' AND b->>'status' IN ('confirmed','checked_in')) OR (p_allow_completed AND s.status='completed' AND b->>'status'='completed')) THEN reason='consultation_inactive'; END IF;
 IF reason IS NOT NULL THEN RETURN result||jsonb_build_object('reason',reason); END IF;
 RETURN result||jsonb_build_object('allowed',true,'slotId',b->>'slot_id');
END $$;
CREATE FUNCTION public.mediid_clinical_audit(p_id uuid,p_actor uuid,p_patient uuid,p_context jsonb,p_action text,p_resource text,p_resource_id uuid,p_allowed boolean,p_reason text,p_basis text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_id IS NULL THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.access_logs(id,patient_id,doctor_id,hospital_appointment_id,private_clinic_appointment_id,accessed_by_id,session_id,action,status,reason,resource_type,resource_id,purpose,access_basis,accessed_at)
 VALUES(p_id,p_patient,(p_context->>'doctorId')::uuid,CASE WHEN p_context->>'domain'='hospital' THEN (p_context->>'appointmentId')::uuid END,CASE WHEN p_context->>'domain'='clinic' THEN (p_context->>'appointmentId')::uuid END,p_actor,(p_context->>'sessionId')::uuid,p_action,CASE WHEN p_allowed THEN 'allowed' ELSE 'denied' END,p_reason,p_resource,p_resource_id,CASE WHEN p_basis='PATIENT_SELF' THEN 'patient_self' ELSE 'clinical_care' END,p_basis,clock_timestamp());
END $$;
CREATE FUNCTION public.mediid_clinical_read(p_actor uuid,p_operation text,p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.users; d uuid; p uuid; c jsonb; result jsonb; rows jsonb; lim int=coalesce((p_input->>'limit')::int,20); k text;
BEGIN
 IF p_operation NOT IN ('queue','ehr','self') OR jsonb_typeof(p_input)<>'object' THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
 FOR k IN SELECT jsonb_object_keys(p_input) LOOP IF k<>ALL(ARRAY['auditId','patientUid','limit','cursor']) THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF; END LOOP;
 SELECT * INTO u FROM public.users WHERE id=p_actor FOR SHARE;
 IF lim NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
 IF p_operation='queue' THEN
  IF p_input ? 'cursor' THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
  IF u.id IS NULL OR NOT u.is_active OR u.role<>'doctor' THEN RETURN jsonb_build_object('allowed',false,'reason','doctor_required'); END IF;
  SELECT id INTO d FROM public.doctors WHERE user_id=p_actor AND is_active;
  IF d IS NULL THEN RETURN jsonb_build_object('allowed',false,'reason','doctor_inactive'); END IF;
  SELECT coalesce(jsonb_agg(q.dto ORDER BY q.slot_start_time,q.id),'[]'::jsonb) INTO rows FROM (
   SELECT a.id,a.slot_start_time,jsonb_build_object('appointmentId',a.id,'domain',a.domain,'patientUid',p.uid,'patient',jsonb_build_object('uid',p.uid,'firstName',p.first_name,'lastName',p.last_name),'organizationId',h.id,'organizationName',h.name,'appointmentDate',a.appointment_date,'timeSlot',a.time_slot,'slotStartTime',a.slot_start_time,'status',a.status,'symptoms',left(a.symptoms,2000),'notes',left(a.notes,2000),'opensAt',s.starts_at,'expiresAt',s.expires_at,'ehrAccess',CASE WHEN NOT h.is_active OR m.doctor_id IS NULL THEN 'locked' WHEN s.expires_at<=clock_timestamp() THEN 'expired' WHEN s.starts_at>clock_timestamp() THEN 'scheduled' WHEN s.status='active' AND a.status IN ('confirmed','checked_in') AND s.starts_at<=clock_timestamp() AND clock_timestamp()<s.expires_at THEN 'active' ELSE 'locked' END) dto
   FROM (SELECT id,patient_id,doctor_id,hospital_id,appointment_date,time_slot,slot_start_time,status::text,symptoms,notes,'hospital'::text domain FROM public.hospital_appointments UNION ALL SELECT id,patient_id,doctor_id,clinic_hospital_id,appointment_date,time_slot,slot_start_time,status::text,symptoms,notes,'clinic'::text FROM public.private_clinic_appointments) a
   JOIN public.patients p ON p.id=a.patient_id JOIN public.hospitals h ON h.id=a.hospital_id LEFT JOIN public.doctor_hospital_memberships m ON m.doctor_id=a.doctor_id AND m.hospital_id=h.id LEFT JOIN public.consultation_sessions s ON s.doctor_id=d AND (s.hospital_appointment_id=a.id OR s.private_clinic_appointment_id=a.id)
   WHERE a.doctor_id=d AND a.slot_start_time>=clock_timestamp()-interval '7 days' AND a.slot_start_time<clock_timestamp()+interval '90 days' ORDER BY a.slot_start_time,a.id LIMIT lim) q;
  RETURN jsonb_build_object('allowed',true,'data',rows);
 END IF;
 IF p_operation='self' THEN
  IF p_input ? 'patientUid' THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
  SELECT id INTO p FROM public.patients WHERE user_id=p_actor AND uid=u.uid FOR SHARE;
  IF p IS NULL OR u.id IS NULL OR NOT u.is_active OR u.role<>'patient' THEN
   PERFORM public.mediid_clinical_audit((p_input->>'auditId')::uuid,p_actor,p,'{}','view_patient_clinical_history','patient_ehr',NULL,false,'patient_self_required','NONE');
   RETURN jsonb_build_object('allowed',false,'reason','patient_self_required');
  END IF;
  c=jsonb_build_object('allowed',true); result=public.mediid_clinical_bundle(p,lim,(p_input->>'cursor')::uuid);
  PERFORM public.mediid_clinical_audit((p_input->>'auditId')::uuid,p_actor,p,c,'view_patient_clinical_history','patient_ehr',NULL,true,NULL,'PATIENT_SELF');
 ELSE
  SELECT id INTO p FROM public.patients WHERE uid=p_input->>'patientUid';
  IF p IS NULL THEN
   c=public.mediid_clinical_context(p_actor,NULL);
   PERFORM public.mediid_clinical_audit((p_input->>'auditId')::uuid,p_actor,NULL,c,'view_ehr','patient_ehr',NULL,false,'no_active_consultation','NONE');
   RETURN jsonb_build_object('allowed',false,'reason','no_active_consultation');
  END IF;
  c=public.mediid_clinical_context(p_actor,p);
  PERFORM public.mediid_clinical_audit((p_input->>'auditId')::uuid,p_actor,p,c,'view_ehr','patient_ehr',NULL,(c->>'allowed')::boolean,c->>'reason',CASE WHEN (c->>'allowed')::boolean THEN 'ACTIVE_CONSULTATION' ELSE 'NONE' END);
  IF NOT (c->>'allowed')::boolean THEN RETURN c-ARRAY['patientId','doctorId','organizationId','appointmentId','domain','sessionId']; END IF;
  result=public.mediid_clinical_bundle(p,lim,(p_input->>'cursor')::uuid)||jsonb_build_object('consultation',c-ARRAY['allowed','patientId','doctorId','domain','slotId','opensAt']);
 END IF;
 RETURN jsonb_build_object('allowed',true,'data',result);
END $$;
CREATE FUNCTION public.mediid_clinical_command(p_actor uuid,p_operation text,p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; e public.encounters; b jsonb; p uuid; a uuid; v_id uuid=(p_input->>'id')::uuid; audit_id uuid=(p_input->>'auditId')::uuid; resource_id uuid; result jsonb; action text; reason text; resource text; k text; fields text[]; count_e int; item jsonb; systolic numeric; diastolic numeric; heart numeric; respiratory numeric; temp numeric; spo2 numeric; weight numeric; height numeric; bmi numeric; now_at timestamptz; n_type text; s1 text; s2 text; s3 text; s4 text; u public.users;
BEGIN
 IF jsonb_typeof(p_input)<>'object' OR audit_id IS NULL THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
 CASE p_operation
 WHEN 'start' THEN fields=ARRAY['appointmentId']; action='start_encounter'; resource='encounter';
 WHEN 'complete' THEN fields='{}'; action='complete_encounter'; resource='encounter';
 WHEN 'vitals' THEN fields=ARRAY['systolicBp','diastolicBp','heartRate','respiratoryRate','temperatureCelsius','spo2Percentage','weightKg','heightCm']; action='record_vitals'; resource='vital';
 WHEN 'note' THEN fields=ARRAY['noteType','subjective','objective','assessment','plan']; action='create_clinical_note'; resource='clinical_note';
 WHEN 'condition' THEN fields=ARRAY['icd10Code','displayName','clinicalStatus','verificationStatus','diagnosedDate']; action='create_condition'; resource='condition';
 WHEN 'allergy' THEN fields=ARRAY['substance','reaction','severity']; action='create_allergy'; resource='allergy';
 WHEN 'prescription' THEN fields=ARRAY['appointmentId','notes','items']; action='create_prescription'; resource='prescription';
 WHEN 'register_document' THEN fields=ARRAY['type','title','fileUrl','fileName','fileSizeBytes','mimeType','notes']; action='register_document'; resource='medical_document';
 ELSE RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END CASE;
 FOR k IN SELECT jsonb_object_keys(p_input) LOOP
  IF k<>ALL(fields||ARRAY['id','auditId','encounterId']) THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
  IF k=ANY(ARRAY['appointmentId','encounterId','id','auditId','noteType','subjective','objective','assessment','plan','icd10Code','displayName','clinicalStatus','verificationStatus','diagnosedDate','substance','reaction','severity','notes','type','title','fileUrl','fileName','mimeType']) AND p_input->k<>'null'::jsonb AND jsonb_typeof(p_input->k)<>'string' THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
 END LOOP;
 IF p_operation='register_document' THEN
  IF p_input ? 'encounterId' THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
  SELECT * INTO u FROM public.users WHERE id=p_actor FOR SHARE;
  SELECT id INTO p FROM public.patients WHERE user_id=p_actor AND uid=u.uid FOR SHARE;
  IF p IS NULL OR u.id IS NULL OR NOT u.is_active OR u.role<>'patient' THEN
   PERFORM public.mediid_clinical_audit(audit_id,p_actor,p,'{}',action,resource,NULL,false,'patient_self_required','NONE'); RETURN jsonb_build_object('allowed',false,'reason','patient_self_required');
  END IF;
  IF v_id IS NULL OR p_input->>'type' NOT IN ('prescription','scan','bill','lab_report','discharge_summary','other') OR p_input->>'type' IS NULL OR p_input->>'fileUrl' IS NULL OR p_input->>'fileUrl'!~'^https://[^/@[:space:]]+([/:?#][^[:cntrl:]]*)?$' OR p_input->>'fileUrl'~'^https://[^/]*@' OR length(p_input->>'fileUrl')>2048 OR (p_input->>'fileUrl')~'[[:cntrl:]]' OR (p_input->>'fileUrl')~'[?#]' THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.medical_documents(id,patient_id,encounter_id,uploaded_by_user_id,type,title,file_url,file_name,file_size_bytes,mime_type,notes)
  VALUES(v_id,p,NULL,p_actor,(p_input->>'type')::public."DocumentType",public.mediid_clinical_text(p_input->>'title',255,true),p_input->>'fileUrl',public.mediid_clinical_text(p_input->>'fileName',255),public.mediid_clinical_number(p_input->'fileSizeBytes',0,104857600,true),public.mediid_clinical_text(p_input->>'mimeType',100),public.mediid_clinical_text(p_input->>'notes',2000));
  PERFORM public.mediid_clinical_audit(audit_id,p_actor,p,'{}',action,resource,v_id,true,NULL,'PATIENT_SELF');
  RETURN jsonb_build_object('allowed',true,'data',(SELECT public.mediid_clinical_document_dto(m.id) FROM public.medical_documents m WHERE id=v_id));
 END IF;
 IF p_operation='start' THEN
  IF p_input ? 'encounterId' OR v_id IS NULL OR p_input->>'appointmentId' IS NULL THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
  a=(p_input->>'appointmentId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.hospital_appointments WHERE id=a UNION ALL SELECT 1 FROM public.private_clinic_appointments WHERE id=a) THEN
   c=public.mediid_clinical_context(p_actor,NULL); PERFORM public.mediid_clinical_audit(audit_id,p_actor,NULL,c,action,resource,NULL,false,'no_active_consultation','NONE'); RETURN jsonb_build_object('allowed',false,'reason','no_active_consultation');
  END IF;
  b=public.mediid_appointment_row(a); p=(b->>'patient_id')::uuid;
 ELSE
  SELECT * INTO e FROM public.encounters WHERE id=(p_input->>'encounterId')::uuid;
  IF e.id IS NULL THEN
   c=public.mediid_clinical_context(p_actor,NULL); PERFORM public.mediid_clinical_audit(audit_id,p_actor,NULL,c,action,resource,NULL,false,'no_active_consultation','NONE'); RETURN jsonb_build_object('allowed',false,'reason','no_active_consultation');
  END IF;
  p=e.patient_id; a=coalesce(e.hospital_appointment_id,e.private_clinic_appointment_id); resource_id=CASE WHEN p_operation='complete' THEN e.id END;
 END IF;
 c=public.mediid_clinical_context(p_actor,p,a,p_operation='complete');
 IF (c->>'allowed')::boolean AND p_operation<>'start' THEN
  SELECT * INTO e FROM public.encounters WHERE id=e.id FOR UPDATE;
  IF a IS NULL OR e.appointment_id IS NOT NULL OR e.patient_id IS DISTINCT FROM p OR e.doctor_id IS DISTINCT FROM (c->>'doctorId')::uuid OR e.hospital_id IS DISTINCT FROM (c->>'organizationId')::uuid OR coalesce(e.hospital_appointment_id,e.private_clinic_appointment_id) IS DISTINCT FROM (c->>'appointmentId')::uuid THEN reason='encounter_context_mismatch';
  ELSIF e.status<>'in_progress' AND NOT (p_operation='complete' AND e.status='completed') THEN reason='encounter_completed'; END IF;
  IF p_operation='complete' AND ((e.status='completed') IS DISTINCT FROM (SELECT s.status='completed' FROM public.consultation_sessions s WHERE s.id=(c->>'sessionId')::uuid)) THEN reason='encounter_reconciliation_required'; END IF;
  IF clock_timestamp()>=(c->>'expiresAt')::timestamptz THEN reason='consultation_expired'; END IF;
 END IF;
 IF NOT (c->>'allowed')::boolean OR reason IS NOT NULL THEN
  reason=coalesce(reason,c->>'reason');
  PERFORM public.mediid_clinical_audit(audit_id,p_actor,p,c,action,resource,resource_id,false,reason,'NONE');
  RETURN (c-ARRAY['patientId','doctorId','organizationId','appointmentId','domain','sessionId','slotId'])||jsonb_build_object('allowed',false,'reason',reason,'conflict',reason='encounter_reconciliation_required');
 END IF;
 -- This subtransaction can undo every clinical mutation if wall-clock expiry
 -- occurs while processing bounded child records, without undoing the denial log.
 BEGIN
 IF p_operation='start' THEN
  SELECT count(*) INTO count_e FROM public.encounters WHERE hospital_appointment_id=a OR private_clinic_appointment_id=a;
  IF count_e>1 THEN reason='encounter_reconciliation_required';
  ELSE
   IF count_e=0 THEN
    INSERT INTO public.encounters(id,patient_id,doctor_id,hospital_id,hospital_appointment_id,private_clinic_appointment_id,encounter_type,status,start_time,chief_complaint)
    VALUES(v_id,p,(c->>'doctorId')::uuid,(c->>'organizationId')::uuid,CASE WHEN c->>'domain'='hospital' THEN a END,CASE WHEN c->>'domain'='clinic' THEN a END,'ambulatory','in_progress',clock_timestamp(),public.mediid_clinical_text(b->>'symptoms',2000));
    resource_id=v_id;
   ELSE SELECT id INTO resource_id FROM public.encounters WHERE hospital_appointment_id=a OR private_clinic_appointment_id=a; END IF;
   result=public.mediid_clinical_encounter_dto(resource_id);
  END IF;
 ELSIF p_operation='complete' THEN
  resource_id=e.id;
  IF e.status='in_progress' THEN
   now_at=clock_timestamp(); UPDATE public.encounters SET status='completed',end_time=now_at WHERE id=e.id;
   IF c->>'domain'='hospital' THEN UPDATE public.hospital_appointments SET status='completed',updated_at=now_at WHERE id=a AND status IN ('confirmed','checked_in');
   ELSE UPDATE public.private_clinic_appointments SET status='completed',updated_at=now_at WHERE id=a AND status IN ('confirmed','checked_in'); END IF;
   UPDATE public.consultation_sessions SET status='completed',completed_at=now_at WHERE id=(c->>'sessionId')::uuid AND status='active';
   PERFORM public.mediid_appointment_slot_state((c->>'slotId')::uuid);
  END IF;
  result=public.mediid_clinical_encounter_dto(e.id);
 ELSE
  IF v_id IS NULL THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
  resource_id=v_id;
  IF p_operation='vitals' THEN
   systolic=public.mediid_clinical_number(p_input->'systolicBp',1,400,true); diastolic=public.mediid_clinical_number(p_input->'diastolicBp',1,300,true); heart=public.mediid_clinical_number(p_input->'heartRate',1,400,true); respiratory=public.mediid_clinical_number(p_input->'respiratoryRate',1,150,true); temp=public.mediid_clinical_number(p_input->'temperatureCelsius',20,50); spo2=public.mediid_clinical_number(p_input->'spo2Percentage',0,100,true); weight=public.mediid_clinical_number(p_input->'weightKg',0.01,999.99); height=public.mediid_clinical_number(p_input->'heightCm',0.01,999.99);
   IF num_nonnulls(systolic,diastolic,heart,respiratory,temp,spo2,weight,height)=0 THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
   IF weight IS NOT NULL AND height IS NOT NULL THEN bmi=round(weight/(height/100)^2,2); IF bmi>99.99 THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF; END IF;
   INSERT INTO public.vitals(id,encounter_id,systolic_bp,diastolic_bp,heart_rate,respiratory_rate,temperature_celsius,spo2_percentage,weight_kg,height_cm,bmi) VALUES(v_id,e.id,systolic,diastolic,heart,respiratory,temp,spo2,weight,height,bmi);
   SELECT public.mediid_clinical_row(to_jsonb(v)||jsonb_build_object('temperature_celsius',v.temperature_celsius::text,'weight_kg',v.weight_kg::text,'height_cm',v.height_cm::text,'bmi',v.bmi::text)) INTO result FROM public.vitals v WHERE id=v_id;
  ELSIF p_operation='note' THEN
   n_type=coalesce(p_input->>'noteType','progress'); IF n_type NOT IN ('progress','consultation','discharge','procedure') THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
   s1=public.mediid_clinical_text(p_input->>'subjective',4000); s2=public.mediid_clinical_text(p_input->>'objective',4000); s3=public.mediid_clinical_text(p_input->>'assessment',4000); s4=public.mediid_clinical_text(p_input->>'plan',4000);
   IF num_nonnulls(s1,s2,s3,s4)=0 THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
   INSERT INTO public.clinical_notes(id,encounter_id,author_id,note_type,subjective,objective,assessment,plan) VALUES(v_id,e.id,p_actor,n_type,s1,s2,s3,s4);
   SELECT public.mediid_clinical_row(to_jsonb(n)) INTO result FROM public.clinical_notes n WHERE id=v_id;
  ELSIF p_operation='condition' THEN
   n_type=coalesce(p_input->>'clinicalStatus','active'); IF n_type NOT IN ('active','resolved') THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
   IF p_input->>'diagnosedDate' IS NOT NULL AND p_input->>'diagnosedDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
   IF (p_input->>'diagnosedDate')::date>CURRENT_DATE THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
   INSERT INTO public.conditions(id,patient_id,encounter_id,icd10_code,display_name,clinical_status,verification_status,diagnosed_date,resolved_date) VALUES(v_id,p,e.id,public.mediid_clinical_text(p_input->>'icd10Code',16),public.mediid_clinical_text(p_input->>'displayName',255,true),n_type,public.mediid_clinical_text(coalesce(p_input->>'verificationStatus','confirmed'),32,true),(p_input->>'diagnosedDate')::date,CASE WHEN n_type='resolved' THEN CURRENT_DATE END);
   SELECT public.mediid_clinical_row(to_jsonb(n)) INTO result FROM public.conditions n WHERE id=v_id;
  ELSIF p_operation='allergy' THEN
   IF p_input->>'severity' IS NOT NULL AND p_input->>'severity' NOT IN ('mild','moderate','severe','fatal') THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
   INSERT INTO public.allergies(id,patient_id,encounter_id,substance,reaction,severity) VALUES(v_id,p,e.id,public.mediid_clinical_text(p_input->>'substance',255,true),public.mediid_clinical_text(p_input->>'reaction',2000),p_input->>'severity');
   SELECT public.mediid_clinical_row(to_jsonb(n)) INTO result FROM public.allergies n WHERE id=v_id;
  ELSIF p_operation='prescription' THEN
   IF (p_input->>'appointmentId')::uuid IS DISTINCT FROM a OR jsonb_typeof(p_input->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
   INSERT INTO public.prescriptions(id,encounter_id,patient_id,doctor_id,hospital_id,notes,status,issued_at) VALUES(v_id,e.id,p,(c->>'doctorId')::uuid,(c->>'organizationId')::uuid,public.mediid_clinical_text(p_input->>'notes',4000),'active',clock_timestamp());
   FOR item IN SELECT value FROM jsonb_array_elements(p_input->'items') LOOP
    IF jsonb_typeof(item)<>'object' OR item->>'id' IS NULL THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
    FOR k IN SELECT jsonb_object_keys(item) LOOP
     IF k<>ALL(ARRAY['id','medicationName','dosage','form','frequency','duration','quantity','instructions']) THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
     IF k<>'quantity' AND item->k<>'null'::jsonb AND jsonb_typeof(item->k)<>'string' THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
    END LOOP;
    IF item->'quantity' IS NULL OR item->'quantity'='null'::jsonb THEN RAISE EXCEPTION 'CLINICAL_INPUT' USING ERRCODE='P0001'; END IF;
    INSERT INTO public.prescription_items(id,prescription_id,medication_name,dosage,form,frequency,duration,quantity,instructions) VALUES((item->>'id')::uuid,v_id,public.mediid_clinical_text(item->>'medicationName',255,true),public.mediid_clinical_text(item->>'dosage',100,true),public.mediid_clinical_text(item->>'form',50),public.mediid_clinical_text(item->>'frequency',100),public.mediid_clinical_text(item->>'duration',50),public.mediid_clinical_number(item->'quantity',1,100000,true),public.mediid_clinical_text(item->>'instructions',2000));
   END LOOP;
   result=public.mediid_clinical_prescription_dto(v_id);
  END IF;
 END IF;
 IF clock_timestamp()>=(c->>'expiresAt')::timestamptz THEN RAISE EXCEPTION 'CLINICAL_WINDOW_ELAPSED' USING ERRCODE='P2601'; END IF;
 EXCEPTION WHEN SQLSTATE 'P2601' THEN reason='consultation_expired'; result=NULL;
 END;
 IF reason IS NOT NULL THEN
  PERFORM public.mediid_clinical_audit(audit_id,p_actor,p,c,action,resource,CASE WHEN p_operation='complete' THEN e.id END,false,reason,'NONE');
  RETURN jsonb_build_object('allowed',false,'reason',reason,'conflict',reason='encounter_reconciliation_required');
 END IF;
 PERFORM public.mediid_clinical_audit(audit_id,p_actor,p,c,action,resource,resource_id,true,NULL,'ACTIVE_CONSULTATION');
 RETURN jsonb_build_object('allowed',true,'data',result);
END $$;

-- Exact entry points only; helpers and direct clinical mutations remain private.
REVOKE ALL ON public.encounters,public.vitals,public.clinical_notes,public.conditions,public.allergies,public.prescriptions,public.prescription_items,public.medical_documents,public.access_logs FROM PUBLIC,mediid_runtime,mediid_diagnostics;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'mediid_clinical_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,mediid_runtime,mediid_diagnostics',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.mediid_clinical_read(uuid,text,jsonb),public.mediid_clinical_command(uuid,text,jsonb) TO mediid_runtime;
COMMIT;
