-- Phase 2.5 external-review correction: preserve provider-local discovery.
-- The pushed Phase 2.5 migration and every other appointment operation stay intact.
BEGIN;

-- Materialized slots have no template FK. Establish the timezone only from a
-- currently applicable recurring template which could have generated this exact
-- interval and its copied properties. Multiple matching templates must agree;
-- unresolved, invalid or ambiguous authority never becomes a Kolkata fallback.
CREATE FUNCTION public.mediid_appointment_availability_zone(p_slot uuid,p_timezone_names text[]) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 s public.materialized_appointment_slots;
 t public.recurring_availability_templates;
 local_start timestamp; local_end timestamp; grid_seconds numeric;
 resolved text; found_zone boolean=false;
BEGIN
 SELECT * INTO s FROM public.materialized_appointment_slots WHERE id=p_slot;
 IF NOT FOUND OR s.hospital_id IS NULL THEN RETURN NULL; END IF;
 FOR t IN SELECT * FROM public.recurring_availability_templates
  WHERE doctor_id=s.doctor_id AND hospital_id=s.hospital_id AND is_active ORDER BY id LOOP
  -- Invalid active scheduling authority cannot be used to infer a timezone.
  IF t.timezone IS NULL OR NOT (t.timezone=ANY(p_timezone_names))
   OR t.start_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR t.end_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR t.start_time>=t.end_time OR t.slot_duration NOT BETWEEN 1 AND 1440
   OR t.capacity_per_slot NOT BETWEEN 1 AND 1000 THEN RETURN NULL; END IF;
  IF t.channel<>s.channel OR t.capacity_per_slot<>s.capacity THEN CONTINUE; END IF;
  local_start=s.slot_start AT TIME ZONE t.timezone;
  local_end=s.slot_end AT TIME ZONE t.timezone;
  IF local_start::date<t.effective_from OR (t.effective_until IS NOT NULL AND local_start::date>t.effective_until)
   OR upper(trim(to_char(local_start,'DAY')))<>upper(t.day_of_week)
   OR local_end::date<>local_start::date
   OR local_start::time<t.start_time::time OR local_end::time>t.end_time::time
   OR s.slot_end-s.slot_start<>make_interval(mins=>t.slot_duration)
   OR local_end-local_start<>make_interval(mins=>t.slot_duration)
   OR (local_start AT TIME ZONE t.timezone)<>s.slot_start THEN CONTINUE; END IF;
  grid_seconds=extract(epoch FROM (local_start-(local_start::date+t.start_time::time)));
  IF grid_seconds<0 OR mod(grid_seconds,t.slot_duration*60)<>0 THEN CONTINUE; END IF;
  IF found_zone AND resolved IS DISTINCT FROM t.timezone THEN RETURN NULL; END IF;
  resolved=t.timezone;found_zone=true;
 END LOOP;
 -- Keep discovery compatible with the unchanged exact-one legacy tuple path.
 -- Older/inactive conflicting metadata must not expose a different local time.
 IF NOT found_zone THEN RETURN NULL; END IF;
 BEGIN
  IF public.mediid_appointment_zone(p_slot) IS DISTINCT FROM resolved THEN RETURN NULL; END IF;
 EXCEPTION WHEN data_exception THEN RETURN NULL;
 END;
 RETURN resolved;
END $$;

REVOKE ALL ON FUNCTION public.mediid_appointment_availability_zone(uuid,text[])
 FROM PUBLIC,mediid_runtime,mediid_diagnostics;

-- Only the availability branch changes: server-owned local date/time and no
-- client timezone override. Other read operations are the reviewed definition.
CREATE OR REPLACE FUNCTION public.mediid_appointment_read(p_actor uuid,p_operation text,p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r text; b jsonb; h uuid; d uuid; result jsonb; timezone_names text[];
BEGIN
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
 IF p_operation='availability' THEN
  IF p_input ? 'timezone' THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  IF coalesce(p_input->>'channel','ONLINE') NOT IN ('ONLINE','OFFLINE') THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  IF p_input->>'channel'='OFFLINE' THEN
   r=public.mediid_appointment_actor(p_actor);
   IF p_input->>'hospitalId' IS NULL OR NOT (public.mediid_appointment_frontdesk(p_actor,(p_input->>'hospitalId')::uuid) OR r='doctor' AND EXISTS(SELECT 1 FROM public.doctors d JOIN public.hospitals h ON h.id=(p_input->>'hospitalId')::uuid AND h.type='clinic' AND h.is_active JOIN public.doctor_hospital_memberships m ON m.doctor_id=d.id AND m.hospital_id=h.id WHERE d.user_id=p_actor AND d.is_active AND d.id=(p_input->>'doctorId')::uuid)) THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  END IF;
  IF p_input->>'date' IS NULL OR (p_input->>'date')::date<CURRENT_DATE-1 OR (p_input->>'date')::date>CURRENT_DATE+91 THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  -- Enumerate timezone authority once and resolve each eligible slot once.
  SELECT array_agg(name) INTO timezone_names FROM pg_timezone_names;
  WITH candidates AS MATERIALIZED (
   SELECT s.*,public.mediid_appointment_availability_zone(s.id,timezone_names) AS provider_timezone
   FROM public.materialized_appointment_slots s
   WHERE s.slot_start>clock_timestamp()+CASE WHEN p_input->>'channel'='OFFLINE' THEN interval '0' ELSE interval '10 minutes' END
   AND s.state NOT IN ('BLOCKED','EXPIRED') AND (s.channel='FLEXIBLE' OR s.channel::text=coalesce(p_input->>'channel','ONLINE'))
   AND (p_input->>'doctorId' IS NULL OR s.doctor_id=(p_input->>'doctorId')::uuid)
   AND (p_input->>'hospitalId' IS NULL OR s.hospital_id=(p_input->>'hospitalId')::uuid)
  )
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'slotStart'),'[]') INTO result FROM (
   SELECT jsonb_build_object('id',s.id,'slotId',s.id,'doctorId',s.doctor_id,'hospitalId',s.hospital_id,'slotStart',s.slot_start,'slotEnd',s.slot_end,'timezone',s.provider_timezone,'timeSlot',to_char(s.slot_start AT TIME ZONE s.provider_timezone,'HH24:MI'),'channel',s.channel,'capacity',s.capacity,'remainingCapacity',s.capacity-(SELECT count(*) FROM public.appointment_slot_reservations q WHERE q.slot_id=s.id AND q.status IN ('HELD','CONFIRMED'))) x
   FROM candidates s JOIN public.doctors d ON d.id=s.doctor_id AND d.is_active JOIN public.hospitals h ON h.id=s.hospital_id AND h.is_active
   JOIN public.doctor_hospital_memberships m ON m.doctor_id=d.id AND m.hospital_id=h.id
   LEFT JOIN public.hospital_scheduling_rules hr ON hr.hospital_id=h.id AND h.type<>'clinic'
   LEFT JOIN public.doctor_clinic_policies cp ON cp.doctor_id=d.id AND h.type='clinic'
   WHERE s.provider_timezone IS NOT NULL
   AND (s.slot_start AT TIME ZONE s.provider_timezone)::date=(p_input->>'date')::date
   AND (p_input->>'channel'='OFFLINE' OR public.appointment_payment_deadline(s.slot_start,clock_timestamp(),coalesce(hr.payment_hold_window_minutes,cp.payment_hold_window_minutes,60),coalesce(hr.safety_cutoff_minutes,cp.safety_cutoff_minutes,10),coalesce(hr.fast_confirm_threshold_minutes,cp.fast_confirm_threshold_minutes,20),coalesce(hr.fast_confirm_window_minutes,cp.fast_confirm_window_minutes,5),coalesce(hr.minimum_online_lead_minutes,cp.minimum_online_lead_minutes,10)) IS NOT NULL)
   AND (SELECT count(*) FROM public.appointment_slot_reservations q WHERE q.slot_id=s.id AND q.status IN ('HELD','CONFIRMED'))<s.capacity ORDER BY s.slot_start,s.id LIMIT least(1000,greatest(1,coalesce((p_input->>'limit')::int,100)))) q;
  RETURN result;
 END IF;
 r=public.mediid_appointment_actor(p_actor);
 IF p_operation='notification' THEN
  b=public.mediid_appointment_row((p_input->>'id')::uuid);
  PERFORM public.mediid_appointment_authorized(p_actor,b);
  IF r='support_agent' AND b->>'booked_by_user_id' IS DISTINCT FROM p_actor::text THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  RETURN jsonb_build_object('appointmentId',b->>'id','contactPhone',b->>'contact_phone','email',(SELECT u.email FROM public.patients q JOIN public.users u ON u.id=q.user_id WHERE q.id=(b->>'patient_id')::uuid));
 END IF;
 IF p_operation='get' THEN b=public.mediid_appointment_row((p_input->>'id')::uuid); PERFORM public.mediid_appointment_authorized(p_actor,b); RETURN public.mediid_appointment_dto(b,p_actor); END IF;
 IF p_operation IN ('policies','policy') THEN
  h=(p_input->>'hospitalId')::uuid;
  IF h IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.hospitals WHERE id=h AND user_id=p_actor AND is_active AND type<>'clinic') OR r<>'hospital_admin' THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
   RETURN public.mediid_appointment_policy(NULL,h);
  END IF;
  SELECT id INTO d FROM public.doctors WHERE user_id=p_actor AND is_active;
  IF r<>'doctor' OR d IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  SELECT id INTO h FROM public.hospitals WHERE type='clinic' AND is_active AND EXISTS(SELECT 1 FROM public.doctor_hospital_memberships WHERE doctor_id=d AND hospital_id=hospitals.id) ORDER BY id LIMIT 1;
  IF h IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  RETURN public.mediid_appointment_policy(d,h);
 END IF;
 IF p_operation IN ('templates','overrides') THEN
  SELECT id INTO d FROM public.doctors WHERE user_id=p_actor AND is_active;
  IF r<>'doctor' OR d IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  IF p_operation='templates' THEN SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY created_at,id),'[]') INTO result FROM public.recurring_availability_templates t WHERE doctor_id=d;
  ELSE SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY start_date_time,id),'[]') INTO result FROM public.schedule_overrides t WHERE doctor_id=d; END IF;
  RETURN result;
 END IF;
 IF p_operation='support' THEN
  IF r<>'support_agent' OR p_input->>'patientId' IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  SELECT q.id INTO d FROM public.patients q JOIN public.users u ON u.id=q.user_id AND u.is_active AND u.role='patient' WHERE q.id::text=p_input->>'patientId' OR q.uid=p_input->>'patientId' OR EXISTS(SELECT 1 FROM public.auth_legacy_links l WHERE l.user_id=q.user_id AND l.patient_mongo_id=p_input->>'patientId' AND l.patient_mongo_id~'^[0-9a-f]{24}$');
  IF d IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
 ELSIF p_operation='my' THEN
  IF r<>'patient' THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  SELECT id INTO d FROM public.patients WHERE user_id=p_actor;
 ELSIF p_operation IN ('hospital','count') THEN
  h=(p_input->>'hospitalId')::uuid;
  IF h IS NULL THEN SELECT x.id INTO h FROM public.hospitals x WHERE public.mediid_appointment_frontdesk(p_actor,x.id) ORDER BY x.id LIMIT 1; END IF;
  IF h IS NULL OR NOT public.mediid_appointment_frontdesk(p_actor,h) THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 ELSIF p_operation='doctor' THEN
  SELECT id INTO d FROM public.doctors WHERE user_id=p_actor AND is_active;
  IF r<>'doctor' OR d IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 ELSE RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
 SELECT coalesce(jsonb_agg(public.mediid_appointment_dto(x,p_actor) ORDER BY x->>'slot_start_time' DESC,x->>'id'),'[]') INTO result FROM (SELECT x FROM (
  SELECT to_jsonb(a)||jsonb_build_object('domain','hospital') x FROM public.hospital_appointments a
  WHERE ((p_operation IN ('my','support') AND a.patient_id=d) OR (p_operation IN ('hospital','count') AND a.hospital_id=h) OR (p_operation='doctor' AND a.doctor_id=d))
  AND (p_input->>'status' IS NULL OR p_input->>'status'='all' OR a.status::text=p_input->>'status') AND (p_input->>'since' IS NULL OR a.updated_at>(p_input->>'since')::timestamptz)
  UNION ALL SELECT to_jsonb(a)||jsonb_build_object('domain','clinic') FROM public.private_clinic_appointments a
  WHERE ((p_operation IN ('my','support') AND a.patient_id=d) OR (p_operation='doctor' AND a.doctor_id=d))
  AND (p_input->>'status' IS NULL OR p_input->>'status'='all' OR a.status::text=p_input->>'status') AND (p_input->>'since' IS NULL OR a.updated_at>(p_input->>'since')::timestamptz)
  ) ordered ORDER BY x->>'slot_start_time' DESC,x->>'id' LIMIT least(1000,greatest(1,coalesce((p_input->>'limit')::int,100)))) q;
 IF p_operation='count' THEN RETURN jsonb_build_object('pending',(SELECT count(*) FROM public.hospital_appointments WHERE hospital_id=h AND status IN ('pending','reminder_sent'))); END IF;
 RETURN result;
END $$;

-- CREATE OR REPLACE preserves the reviewed entry point's ownership/grants.
REVOKE ALL ON FUNCTION public.mediid_appointment_read(uuid,text,jsonb) FROM PUBLIC,mediid_diagnostics;
GRANT EXECUTE ON FUNCTION public.mediid_appointment_read(uuid,text,jsonb) TO mediid_runtime;
COMMIT;
