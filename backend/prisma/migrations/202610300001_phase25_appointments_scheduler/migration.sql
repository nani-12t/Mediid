-- Phase 2.5 operational appointments. Historical triggers remain authoritative.
BEGIN;
ALTER TABLE public.consultation_sessions ADD COLUMN starts_at timestamptz;
CREATE UNIQUE INDEX consultation_hospital_once ON public.consultation_sessions(hospital_appointment_id);
CREATE UNIQUE INDEX consultation_clinic_once ON public.consultation_sessions(private_clinic_appointment_id);
CREATE UNIQUE INDEX consultation_legacy_once ON public.consultation_sessions(appointment_id);
ALTER TABLE public.consultation_sessions ADD CONSTRAINT consultation_window_bounds CHECK(starts_at IS NULL OR starts_at < expires_at);
CREATE TABLE public.appointment_notification_claims (
 hospital_appointment_id uuid REFERENCES public.hospital_appointments(id) ON DELETE RESTRICT,
 private_clinic_appointment_id uuid REFERENCES public.private_clinic_appointments(id) ON DELETE RESTRICT,
 kind text NOT NULL, epoch timestamptz NOT NULL, claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(num_nonnulls(hospital_appointment_id,private_clinic_appointment_id)=1));
CREATE UNIQUE INDEX appointment_notice_hospital_once ON public.appointment_notification_claims(hospital_appointment_id,kind,epoch);
CREATE UNIQUE INDEX appointment_notice_clinic_once ON public.appointment_notification_claims(private_clinic_appointment_id,kind,epoch);
REVOKE ALL ON public.appointment_notification_claims FROM PUBLIC,mediid_runtime,mediid_diagnostics;

-- Core PostgreSQL gen_random_uuid uses cryptographic randomness. Timestamp prefix and
-- version nibble yield UUIDv7 without requiring a PostgreSQL-18-only uuidv7 builtin.
CREATE FUNCTION public.mediid_appointment_uuid() RETURNS uuid LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public AS $$
DECLARE r text=replace(gen_random_uuid()::text,'-',''); t text;
BEGIN t=lpad(to_hex(floor(extract(epoch FROM clock_timestamp())*1000)::bigint),12,'0');
 RETURN (t||'7'||substr(r,14))::uuid; END $$;

CREATE FUNCTION public.mediid_appointment_actor(p_actor uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r text;
BEGIN SELECT role::text INTO r FROM public.users WHERE id=p_actor AND is_active FOR SHARE;
 IF r IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 RETURN r; END $$;
CREATE FUNCTION public.mediid_appointment_frontdesk(p_actor uuid,p_hospital uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.users u JOIN public.hospitals h ON h.id=p_hospital AND h.is_active AND h.type<>'clinic'
 WHERE u.id=p_actor AND u.is_active AND ((u.role='hospital_admin' AND h.user_id=u.id) OR
 (u.role='hospital_staff' AND EXISTS(SELECT 1 FROM public.hospital_memberships s WHERE s.user_id=u.id AND s.hospital_id=h.id AND s.is_active AND s.role='receptionist')))) $$;
CREATE FUNCTION public.mediid_appointment_row(p_id uuid,p_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE b jsonb;
BEGIN
 IF p_lock THEN SELECT to_jsonb(a)||jsonb_build_object('domain','hospital') INTO b FROM public.hospital_appointments a WHERE id=p_id FOR UPDATE;
 ELSE SELECT to_jsonb(a)||jsonb_build_object('domain','hospital') INTO b FROM public.hospital_appointments a WHERE id=p_id; END IF;
 IF b IS NULL THEN
  IF p_lock THEN SELECT to_jsonb(a)||jsonb_build_object('domain','clinic') INTO b FROM public.private_clinic_appointments a WHERE id=p_id FOR UPDATE;
  ELSE SELECT to_jsonb(a)||jsonb_build_object('domain','clinic') INTO b FROM public.private_clinic_appointments a WHERE id=p_id; END IF;
 END IF;
 IF b IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
 RETURN b;
END $$;
CREATE FUNCTION public.mediid_appointment_authorized(p_actor uuid,b jsonb,p_provider boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r text; h uuid=coalesce(b->>'hospital_id',b->>'clinic_hospital_id')::uuid;
BEGIN r=public.mediid_appointment_actor(p_actor);
 IF NOT p_provider AND r='patient' AND EXISTS(SELECT 1 FROM public.patients WHERE id=(b->>'patient_id')::uuid AND user_id=p_actor) THEN RETURN 'PATIENT'; END IF;
 IF b->>'domain'='hospital' AND public.mediid_appointment_frontdesk(p_actor,h) THEN RETURN 'HOSPITAL_FRONT_DESK'; END IF;
 IF r='doctor' AND EXISTS(SELECT 1 FROM public.doctors WHERE id=(b->>'doctor_id')::uuid AND user_id=p_actor AND is_active) THEN RETURN 'DOCTOR'; END IF;
 IF NOT p_provider AND r='support_agent' THEN RETURN 'SUPPORT_AGENT'; END IF;
 RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001';
END $$;
CREATE FUNCTION public.mediid_appointment_dto(b jsonb,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; r text;
BEGIN
 SELECT role::text INTO r FROM public.users WHERE id=p_actor AND is_active;
 result=b-ARRAY['confirm_token','payment_idempotency_key','policy_snapshot','transfer_approved_by_user_id','legacy_source_id','legacy_imported_at','clinical_context_version','support_notes','staff_notes','doctor_notes'];
 IF r NOT IN ('patient','doctor') OR r IS NULL THEN result=result-ARRAY['symptoms','notes']; END IF;
 IF public.mediid_appointment_frontdesk(p_actor,coalesce(b->>'hospital_id',b->>'clinic_hospital_id')::uuid) THEN result=result||jsonb_build_object('staff_notes',b->'staff_notes'); END IF;
 RETURN result||jsonb_build_object('confirmToken',NULL,
 'patient',(SELECT jsonb_build_object('id',id,'_id',id,'uid',uid,'firstName',first_name,'lastName',last_name) FROM public.patients WHERE id=(b->>'patient_id')::uuid),
 'doctor',(SELECT jsonb_build_object('id',id,'_id',id,'uid',uid,'firstName',first_name,'lastName',last_name,'specialization',specialization) FROM public.doctors WHERE id=(b->>'doctor_id')::uuid),
 'hospital',(SELECT jsonb_build_object('id',id,'_id',id,'uid',uid,'name',name,'type',type) FROM public.hospitals WHERE id=coalesce(b->>'hospital_id',b->>'clinic_hospital_id')::uuid));
END $$;
CREATE FUNCTION public.mediid_appointment_slot_state(p_slot uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.materialized_appointment_slots; n int; held boolean; next_state public."SlotState";
BEGIN SELECT * INTO s FROM public.materialized_appointment_slots WHERE id=p_slot FOR UPDATE;
 IF NOT FOUND OR s.state IN ('BLOCKED','EXPIRED') THEN RETURN; END IF;
 SELECT count(*),coalesce(bool_or(status='HELD'),false) INTO n,held FROM public.appointment_slot_reservations WHERE slot_id=p_slot AND status IN ('HELD','CONFIRMED');
 next_state=CASE WHEN n<s.capacity THEN 'AVAILABLE'::public."SlotState" WHEN held THEN 'HELD'::public."SlotState" ELSE 'BOOKED'::public."SlotState" END;
 UPDATE public.materialized_appointment_slots SET state=next_state,version=version+1,
 reopened_count=reopened_count+CASE WHEN s.state IN ('HELD','BOOKED') AND n<s.capacity THEN 1 ELSE 0 END,
 last_reopened_at=CASE WHEN s.state IN ('HELD','BOOKED') AND n<s.capacity THEN clock_timestamp() ELSE last_reopened_at END,updated_at=clock_timestamp() WHERE id=p_slot;
END $$;
CREATE FUNCTION public.mediid_appointment_policy(p_doctor uuid,p_hospital uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE raw jsonb; p jsonb='{}'; k text; v jsonb; camel text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.hospitals WHERE id=p_hospital AND type='clinic') THEN
 INSERT INTO public.doctor_clinic_policies(id,doctor_id,updated_at) VALUES(public.mediid_appointment_uuid(),p_doctor,clock_timestamp()) ON CONFLICT(doctor_id) DO NOTHING;
 SELECT to_jsonb(a) INTO raw FROM public.doctor_clinic_policies a WHERE doctor_id=p_doctor;
 raw=raw||jsonb_build_object('deposit_required',true,'confirmation_mode','DEPOSIT');
 ELSE
 INSERT INTO public.hospital_scheduling_rules(id,hospital_id,updated_at) VALUES(public.mediid_appointment_uuid(),p_hospital,clock_timestamp()) ON CONFLICT(hospital_id) DO NOTHING;
 SELECT to_jsonb(a) INTO raw FROM public.hospital_scheduling_rules a WHERE hospital_id=p_hospital;
 END IF;
 -- Only the typed, reviewed policy fields have executable cancellation semantics.
 -- Imported opaque terms require operator review rather than silent omission.
 IF jsonb_typeof(raw->'cancellation_rules') IS DISTINCT FROM 'object' OR raw->'cancellation_rules' IS DISTINCT FROM '{}'::jsonb THEN
  RAISE EXCEPTION 'APPOINTMENT_POLICY_CONFLICT' USING ERRCODE='P0001';
 END IF;
 FOR k,v IN SELECT key,value FROM jsonb_each(raw) LOOP
 SELECT string_agg(CASE WHEN ord=1 THEN part ELSE upper(left(part,1))||substr(part,2) END,'' ORDER BY ord) INTO camel FROM unnest(string_to_array(k,'_')) WITH ORDINALITY q(part,ord);
 p=p||jsonb_build_object(camel,v);
 END LOOP;
 RETURN p;
END $$;
CREATE FUNCTION public.mediid_appointment_session(b jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE h uuid=coalesce(b->>'hospital_id',b->>'clinic_hospital_id')::uuid;
BEGIN
 INSERT INTO public.consultation_sessions(id,patient_id,doctor_id,hospital_id,hospital_appointment_id,private_clinic_appointment_id,token,status,starts_at,expires_at)
 VALUES(public.mediid_appointment_uuid(),(b->>'patient_id')::uuid,(b->>'doctor_id')::uuid,h,
 CASE WHEN b->>'domain'='hospital' THEN (b->>'id')::uuid END,CASE WHEN b->>'domain'='clinic' THEN (b->>'id')::uuid END,
 replace(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'scheduled',
 (b->>'slot_start_time')::timestamptz-interval '10 minutes',(b->>'slot_start_time')::timestamptz+interval '2 hours') ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION public.mediid_appointment_refund_due(b jsonb,p_actor uuid,p_percent numeric,p_prefix text) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.appointment_payments; due numeric; total numeric=0;
BEGIN
 IF p_percent<0 OR p_percent>100 THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
 FOR p IN SELECT * FROM public.appointment_payments WHERE status='CAPTURED' AND (hospital_appointment_id=(b->>'id')::uuid OR private_clinic_appointment_id=(b->>'id')::uuid) ORDER BY id FOR UPDATE LOOP
  due=greatest(0,round(p.amount*p_percent/100,2)-p.refund_allocated);
  IF due>0 THEN
   INSERT INTO public.appointment_refunds(id,payment_id,hospital_appointment_id,private_clinic_appointment_id,actor_user_id,amount,currency,provider,idempotency_key)
   VALUES(public.mediid_appointment_uuid(),p.id,p.hospital_appointment_id,p.private_clinic_appointment_id,p_actor,due,p.currency,p.provider,p_prefix||':'||p.id::text)
   ON CONFLICT(idempotency_key) DO NOTHING;
   total=total+due;
  END IF;
 END LOOP;
 RETURN total;
END $$;
CREATE FUNCTION public.mediid_appointment_finalize(p_id uuid,p_method text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE b jsonb; t text; r public.appointment_slot_reservations; h uuid; d uuid;
BEGIN
 b=public.mediid_appointment_row(p_id,true);
 IF b->>'status'='confirmed' THEN PERFORM public.mediid_appointment_session(b); RETURN false; END IF;
 IF b->>'status' NOT IN ('pending','reminder_sent') OR (b->>'slot_start_time')::timestamptz<=clock_timestamp() THEN RETURN false; END IF;
 h=coalesce(b->>'hospital_id',b->>'clinic_hospital_id')::uuid; d=(b->>'doctor_id')::uuid;
 PERFORM 1 FROM public.hospitals WHERE id=h AND is_active FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.doctors WHERE id=d AND is_active FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.doctor_hospital_memberships WHERE doctor_id=d AND hospital_id=h) THEN RETURN false; END IF;
 PERFORM 1 FROM public.materialized_appointment_slots WHERE id=(b->>'slot_id')::uuid AND doctor_id=d AND hospital_id=h AND state NOT IN ('BLOCKED','EXPIRED');
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO r FROM public.appointment_slot_reservations WHERE (hospital_appointment_id=p_id OR private_clinic_appointment_id=p_id) AND status IN ('HELD','CONFIRMED') FOR UPDATE;
 IF NOT FOUND OR (r.status='HELD' AND r.expires_at<=clock_timestamp()) THEN RETURN false; END IF;
 IF (b->>'deposit_amount')::numeric>(b->>'amount_paid')::numeric AND b->>'appointment_channel'='ONLINE' THEN RETURN false; END IF;
 IF r.status='HELD' THEN UPDATE public.appointment_slot_reservations SET status='CONFIRMED' WHERE id=r.id; END IF;
 t=CASE WHEN b->>'domain'='hospital' THEN 'hospital_appointments' ELSE 'private_clinic_appointments' END;
 EXECUTE format('UPDATE public.%I SET status=''confirmed'',confirmed_at=clock_timestamp(),confirmation_method=$2,updated_at=clock_timestamp() WHERE id=$1',t) USING p_id,p_method;
 b=public.mediid_appointment_row(p_id); PERFORM public.mediid_appointment_session(b); PERFORM public.mediid_appointment_slot_state(r.slot_id);
 RETURN true;
END $$;

-- Membership guard runs inside the existing reviewed membership-removal transaction.
-- Those entry points lock the organization and doctor before this DELETE; booking
-- and materialization take matching SHARE locks before checking membership.
CREATE FUNCTION public.mediid_appointment_membership_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.hospital_appointments a WHERE a.doctor_id=OLD.doctor_id AND a.hospital_id=OLD.hospital_id AND a.slot_start_time>clock_timestamp() AND a.status IN ('pending','reminder_sent','confirmed','checked_in')) OR
 EXISTS(SELECT 1 FROM public.private_clinic_appointments a WHERE a.doctor_id=OLD.doctor_id AND a.clinic_hospital_id=OLD.hospital_id AND a.slot_start_time>clock_timestamp() AND a.status IN ('pending','reminder_sent','confirmed','checked_in')) THEN
 RAISE EXCEPTION 'AUTH_CONFLICT' USING ERRCODE='P0001',DETAIL='APPOINTMENT_MEMBERSHIP_CONFLICT'; END IF;
 UPDATE public.materialized_appointment_slots s SET state='BLOCKED',updated_at=clock_timestamp(),version=version+1
 WHERE s.doctor_id=OLD.doctor_id AND s.hospital_id=OLD.hospital_id AND s.slot_start>clock_timestamp() AND s.state<>'EXPIRED'
 AND NOT EXISTS(SELECT 1 FROM public.appointment_slot_reservations r WHERE r.slot_id=s.id AND r.status IN ('HELD','CONFIRMED'));
 RETURN OLD;
END $$;
CREATE TRIGGER appointment_membership_guard BEFORE DELETE ON public.doctor_hospital_memberships FOR EACH ROW EXECUTE FUNCTION public.mediid_appointment_membership_guard();
CREATE FUNCTION public.mediid_appointment_materialize(p_days integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.recurring_availability_templates; d date; first_day date; s timestamptz; e timestamptz; local_start timestamp; z text; n int=0; skipped int=0;
BEGIN
 IF p_days NOT BETWEEN 7 AND 90 THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
 FOR t IN SELECT * FROM public.recurring_availability_templates WHERE is_active AND hospital_id IS NOT NULL ORDER BY hospital_id,doctor_id,id LOOP
  PERFORM 1 FROM public.hospitals WHERE id=t.hospital_id AND is_active FOR SHARE;
  IF NOT FOUND THEN CONTINUE; END IF;
  PERFORM 1 FROM public.doctors WHERE id=t.doctor_id AND is_active FOR SHARE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.doctor_hospital_memberships WHERE doctor_id=t.doctor_id AND hospital_id=t.hospital_id) THEN CONTINUE; END IF;
  SELECT a.* INTO t FROM public.recurring_availability_templates a WHERE a.id=t.id AND a.is_active FOR SHARE;
  IF NOT FOUND THEN CONTINUE; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=t.timezone) OR t.start_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR t.end_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR t.start_time>=t.end_time OR t.slot_duration NOT BETWEEN 1 AND 1440 OR t.capacity_per_slot NOT BETWEEN 1 AND 1000 THEN
   RAISE EXCEPTION 'APPOINTMENT_TEMPLATE_INVALID' USING ERRCODE='P0001'; END IF;
  first_day=(clock_timestamp() AT TIME ZONE t.timezone)::date;
  FOR d IN SELECT generate_series(greatest(first_day,t.effective_from)::timestamp,least(first_day+p_days,coalesce(t.effective_until,first_day+p_days))::timestamp,interval '1 day')::date LOOP
   IF upper(trim(to_char(d,'DAY')))<>upper(t.day_of_week) THEN CONTINUE; END IF;
   FOR local_start IN SELECT g FROM generate_series(d+t.start_time::time,d+t.end_time::time-make_interval(mins=>t.slot_duration),make_interval(mins=>t.slot_duration)) g LOOP
    s=local_start AT TIME ZONE t.timezone; e=s+make_interval(mins=>t.slot_duration);
    IF (s AT TIME ZONE t.timezone)<>local_start OR (e AT TIME ZONE t.timezone)<>local_start+make_interval(mins=>t.slot_duration) THEN CONTINUE; END IF;
    IF s<=clock_timestamp() OR (e AT TIME ZONE t.timezone)::date<>d OR (e AT TIME ZONE t.timezone)::time>t.end_time::time THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.schedule_overrides o WHERE o.doctor_id=t.doctor_id AND (o.hospital_id IS NULL OR o.hospital_id=t.hospital_id) AND o.override_type<>'CUSTOM_HOURS' AND tstzrange(o.start_date_time,o.end_date_time,'[)')&&tstzrange(s,e,'[)')) THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.schedule_overrides o WHERE o.doctor_id=t.doctor_id AND (o.hospital_id IS NULL OR o.hospital_id=t.hospital_id) AND o.override_type='CUSTOM_HOURS' AND d BETWEEN (o.start_date_time AT TIME ZONE t.timezone)::date AND ((o.end_date_time-interval '1 microsecond') AT TIME ZONE t.timezone)::date)
     AND NOT EXISTS(SELECT 1 FROM public.schedule_overrides o WHERE o.doctor_id=t.doctor_id AND (o.hospital_id IS NULL OR o.hospital_id=t.hospital_id) AND o.override_type='CUSTOM_HOURS' AND s>=o.start_date_time AND e<=o.end_date_time) THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.materialized_appointment_slots a WHERE a.doctor_id=t.doctor_id AND a.hospital_id=t.hospital_id AND a.slot_start=s AND a.slot_end=e AND a.state<>'EXPIRED') THEN CONTINUE; END IF;
    BEGIN
     INSERT INTO public.materialized_appointment_slots(id,doctor_id,hospital_id,slot_start,slot_end,channel,capacity,updated_at) VALUES(public.mediid_appointment_uuid(),t.doctor_id,t.hospital_id,s,e,t.channel,t.capacity_per_slot,clock_timestamp()); n=n+1;
    EXCEPTION WHEN exclusion_violation OR unique_violation THEN skipped=skipped+1; END;
   END LOOP;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('created',n,'overlapSkipped',skipped);
END $$;

CREATE FUNCTION public.mediid_appointment_read(p_actor uuid,p_operation text,p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r text; b jsonb; h uuid; d uuid; result jsonb; zone text=coalesce(p_input->>'timezone','Asia/Kolkata');
BEGIN
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
 IF p_operation='availability' THEN
  IF coalesce(p_input->>'channel','ONLINE') NOT IN ('ONLINE','OFFLINE') THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  IF p_input->>'channel'='OFFLINE' THEN
   r=public.mediid_appointment_actor(p_actor);
   IF p_input->>'hospitalId' IS NULL OR NOT (public.mediid_appointment_frontdesk(p_actor,(p_input->>'hospitalId')::uuid) OR r='doctor' AND EXISTS(SELECT 1 FROM public.doctors d JOIN public.hospitals h ON h.id=(p_input->>'hospitalId')::uuid AND h.type='clinic' AND h.is_active JOIN public.doctor_hospital_memberships m ON m.doctor_id=d.id AND m.hospital_id=h.id WHERE d.user_id=p_actor AND d.is_active AND d.id=(p_input->>'doctorId')::uuid)) THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  IF p_input->>'date' IS NULL OR (p_input->>'date')::date<CURRENT_DATE-1 OR (p_input->>'date')::date>CURRENT_DATE+91 THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'slotStart'),'[]') INTO result FROM (
   SELECT jsonb_build_object('id',s.id,'slotId',s.id,'doctorId',s.doctor_id,'hospitalId',s.hospital_id,'slotStart',s.slot_start,'slotEnd',s.slot_end,'channel',s.channel,'capacity',s.capacity,'remainingCapacity',s.capacity-(SELECT count(*) FROM public.appointment_slot_reservations q WHERE q.slot_id=s.id AND q.status IN ('HELD','CONFIRMED'))) x
   FROM public.materialized_appointment_slots s JOIN public.doctors d ON d.id=s.doctor_id AND d.is_active JOIN public.hospitals h ON h.id=s.hospital_id AND h.is_active
   JOIN public.doctor_hospital_memberships m ON m.doctor_id=d.id AND m.hospital_id=h.id
   LEFT JOIN public.hospital_scheduling_rules hr ON hr.hospital_id=h.id AND h.type<>'clinic'
   LEFT JOIN public.doctor_clinic_policies cp ON cp.doctor_id=d.id AND h.type='clinic'
   WHERE s.slot_start>clock_timestamp()+CASE WHEN p_input->>'channel'='OFFLINE' THEN interval '0' ELSE interval '10 minutes' END AND s.state NOT IN ('BLOCKED','EXPIRED') AND (s.channel='FLEXIBLE' OR s.channel::text=coalesce(p_input->>'channel','ONLINE'))
   AND (s.slot_start AT TIME ZONE zone)::date=(p_input->>'date')::date
   AND (p_input->>'doctorId' IS NULL OR s.doctor_id=(p_input->>'doctorId')::uuid)
   AND (p_input->>'hospitalId' IS NULL OR s.hospital_id=(p_input->>'hospitalId')::uuid)
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
-- Resolve presentation dates against an applicable recurring IANA timezone.
-- UTC instants remain the canonical booking identity.
CREATE FUNCTION public.mediid_appointment_zone(p_slot uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce((SELECT t.timezone FROM public.materialized_appointment_slots s JOIN public.recurring_availability_templates t ON t.doctor_id=s.doctor_id AND t.hospital_id=s.hospital_id
 WHERE s.id=p_slot AND (s.slot_start AT TIME ZONE t.timezone)::date>=t.effective_from
 AND (t.effective_until IS NULL OR (s.slot_start AT TIME ZONE t.timezone)::date<=t.effective_until)
 AND upper(trim(to_char(s.slot_start AT TIME ZONE t.timezone,'DAY')))=upper(t.day_of_week)
 AND (s.slot_start AT TIME ZONE t.timezone)::time>=t.start_time::time AND (s.slot_end AT TIME ZONE t.timezone)::time<=t.end_time::time
 ORDER BY t.id LIMIT 1),'Asia/Kolkata') $$;
CREATE FUNCTION public.mediid_appointment_reconcile_override(p_doctor uuid,p_hospital uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.materialized_appointment_slots; zone text; blocked boolean;
BEGIN
 FOR s IN SELECT a.* FROM public.materialized_appointment_slots a WHERE a.doctor_id=p_doctor AND (p_hospital IS NULL OR a.hospital_id=p_hospital) AND a.slot_start>clock_timestamp() AND a.state<>'EXPIRED' ORDER BY a.id FOR UPDATE LOOP
  zone=public.mediid_appointment_zone(s.id);
  SELECT EXISTS(SELECT 1 FROM public.schedule_overrides o WHERE o.doctor_id=p_doctor AND (o.hospital_id IS NULL OR o.hospital_id=s.hospital_id) AND o.override_type<>'CUSTOM_HOURS' AND tstzrange(o.start_date_time,o.end_date_time,'[)')&&tstzrange(s.slot_start,s.slot_end,'[)'))
   OR (EXISTS(SELECT 1 FROM public.schedule_overrides o WHERE o.doctor_id=p_doctor AND (o.hospital_id IS NULL OR o.hospital_id=s.hospital_id) AND o.override_type='CUSTOM_HOURS' AND (s.slot_start AT TIME ZONE zone)::date BETWEEN (o.start_date_time AT TIME ZONE zone)::date AND ((o.end_date_time-interval '1 microsecond') AT TIME ZONE zone)::date)
   AND NOT EXISTS(SELECT 1 FROM public.schedule_overrides o WHERE o.doctor_id=p_doctor AND (o.hospital_id IS NULL OR o.hospital_id=s.hospital_id) AND o.override_type='CUSTOM_HOURS' AND s.slot_start>=o.start_date_time AND s.slot_end<=o.end_date_time)) INTO blocked;
  IF blocked THEN
   IF EXISTS(SELECT 1 FROM public.appointment_slot_reservations r WHERE r.slot_id=s.id AND r.status IN ('HELD','CONFIRMED')) THEN RAISE EXCEPTION 'APPOINTMENT_SCHEDULE_CONFLICT' USING ERRCODE='P0001'; END IF;
   UPDATE public.materialized_appointment_slots SET state='BLOCKED',version=version+1,updated_at=clock_timestamp() WHERE id=s.id AND state<>'BLOCKED';
  ELSIF s.state='BLOCKED' AND NOT EXISTS(SELECT 1 FROM public.appointment_slot_reservations r WHERE r.slot_id=s.id AND r.status IN ('HELD','CONFIRMED')) THEN
   -- EXPIRED retains history but permits a newly evaluated canonical interval.
   UPDATE public.materialized_appointment_slots SET state='EXPIRED',version=version+1,updated_at=clock_timestamp() WHERE id=s.id;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.mediid_appointment_refund_summary(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE b jsonb; t text; amount numeric; pending_count int; success_count int; failed_count int; transaction_ref text; next_status text;
BEGIN
 b=public.mediid_appointment_row(p_id,true);
 SELECT coalesce(sum(r.amount) FILTER(WHERE r.status<>'FAILED'),0),count(*) FILTER(WHERE r.status IN ('REQUESTED','PROCESSING')),count(*) FILTER(WHERE r.status='SUCCEEDED'),count(*) FILTER(WHERE r.status='FAILED'),max(r.provider_transaction_ref) FILTER(WHERE r.status='SUCCEEDED')
 INTO amount,pending_count,success_count,failed_count,transaction_ref FROM public.appointment_refunds r WHERE r.hospital_appointment_id=p_id OR r.private_clinic_appointment_id=p_id;
 next_status=CASE WHEN pending_count>0 THEN 'PENDING' WHEN success_count>0 THEN 'COMPLETED' WHEN failed_count>0 THEN 'FAILED' ELSE 'NOT_APPLICABLE' END;
 t=CASE WHEN b->>'domain'='hospital' THEN 'hospital_appointments' ELSE 'private_clinic_appointments' END;
 EXECUTE format('UPDATE public.%I SET refund_status=$2::public."RefundStatus",refund_amount=$3,refund_transaction_ref=$4,updated_at=clock_timestamp() WHERE id=$1',t) USING p_id,next_status,amount,transaction_ref;
END $$;
CREATE FUNCTION public.mediid_appointment_command(p_actor uuid,p_operation text,p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE role_name text; authority text; b jsonb; old_b jsonb; p jsonb; patch jsonb='{}'; k text; v jsonb; col text; set_sql text;
 s public.materialized_appointment_slots; old_slot uuid; h public.hospitals; d public.doctors; patient public.patients;
 t text; v_id uuid=(p_input->>'id')::uuid; seat int; online boolean; need_hold boolean; amount numeric; fee numeric; pct numeric; refund_total numeric; initial_status text; source text; selected_channel text;
 pay public.appointment_payments; ref public.appointment_refunds; token text; is_late boolean; r public.appointment_slot_reservations; due timestamptz;
BEGIN
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
 IF p_actor IS NOT NULL THEN role_name=public.mediid_appointment_actor(p_actor);
 ELSIF p_operation NOT IN ('paymentCapture','refundUpdate') THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 IF p_operation='template' THEN
  v_id=coalesce(v_id,public.mediid_appointment_uuid());
  PERFORM public.mediid_save_availability_template(p_actor,v_id,coalesce((p_input->>'auditId')::uuid,public.mediid_appointment_uuid()),p_input->'patch',coalesce((p_input->>'isCreate')::boolean,false));
  RETURN jsonb_build_object('id',v_id);
 END IF;
 IF p_operation='policy' THEN
  IF p_input->>'hospitalId' IS NOT NULL THEN
   SELECT * INTO h FROM public.hospitals WHERE id=(p_input->>'hospitalId')::uuid AND is_active AND type<>'clinic' AND user_id=p_actor FOR NO KEY UPDATE;
   IF NOT FOUND OR role_name<>'hospital_admin' THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
   p=public.mediid_appointment_policy(NULL,h.id); t='hospital_scheduling_rules'; col='hospital_id'; v_id=h.id;
  ELSE
   SELECT * INTO d FROM public.doctors WHERE user_id=p_actor AND is_active FOR NO KEY UPDATE;
   IF NOT FOUND OR role_name<>'doctor' THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
   SELECT * INTO h FROM public.hospitals WHERE type='clinic' AND is_active AND EXISTS(SELECT 1 FROM public.doctor_hospital_memberships WHERE doctor_id=d.id AND hospital_id=hospitals.id) ORDER BY id LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
   p=public.mediid_appointment_policy(d.id,h.id); t='doctor_clinic_policies'; col='doctor_id'; v_id=d.id;
  END IF;
  FOR k,v IN SELECT key,value FROM jsonb_each(coalesce(p_input->'patch',p_input-'hospitalId')) LOOP
   IF k NOT IN ('confirmationMode','depositRequired','depositPercentage','depositFixedAmount','paymentHoldWindowMinutes','safetyCutoffMinutes','fastConfirmWindowMinutes','fastConfirmThresholdMinutes','minimumOnlineLeadMinutes','confirmationLeadMinutes','patientRefundPercentage','lateRefundPercentage','providerRefundPercentage','allowPatientApprovedTransfer','cancellationRules','noShowRefundPercentage','cancellationCutoffHours','rescheduleCutoffHours','maxRescheduleCount','refundPolicyNotes','allowWalkIns','allowPhoneBookings','noShowFeeDeduction')
    OR (t='doctor_clinic_policies' AND k IN ('confirmationMode','depositRequired','depositFixedAmount')) OR (t='hospital_scheduling_rules' AND k='noShowFeeDeduction') OR v='null'::jsonb AND k NOT IN ('depositFixedAmount','refundPolicyNotes') THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
   patch=patch||jsonb_build_object(lower(regexp_replace(k,'([A-Z])','_\1','g')),v);
  END LOOP;
  SELECT string_agg(format('%I=x.%I',key,key),',') INTO set_sql FROM jsonb_each(patch);
  IF set_sql IS NULL THEN RETURN p; END IF;
  EXECUTE format('UPDATE public.%1$I a SET %2$s,updated_at=clock_timestamp() FROM jsonb_populate_record(NULL::public.%1$I,$1) x WHERE a.%3$I=$2',t,set_sql,col) USING patch,v_id;
  RETURN public.mediid_appointment_policy(d.id,h.id);
 END IF;
 IF p_operation IN ('override','deleteOverride') THEN
  SELECT * INTO d FROM public.doctors WHERE user_id=p_actor AND is_active FOR UPDATE;
  IF NOT FOUND OR role_name<>'doctor' THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  IF p_operation='deleteOverride' THEN
   DELETE FROM public.schedule_overrides WHERE schedule_overrides.id=v_id AND doctor_id=d.id RETURNING to_jsonb(schedule_overrides) INTO b;
   IF b IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
   -- Retire only unreserved blocked metadata; rolling materialization re-evaluates
   -- all remaining overrides and memberships before creating replacement capacity.
   UPDATE public.materialized_appointment_slots z SET state='EXPIRED',version=version+1,updated_at=clock_timestamp()
   WHERE z.doctor_id=d.id AND z.slot_start>clock_timestamp() AND z.state='BLOCKED'
    AND (b->>'hospital_id' IS NULL OR z.hospital_id=(b->>'hospital_id')::uuid)
    AND NOT EXISTS(SELECT 1 FROM public.appointment_slot_reservations q WHERE q.slot_id=z.id AND q.status IN ('HELD','CONFIRMED'));
   PERFORM public.mediid_appointment_reconcile_override(d.id,(b->>'hospital_id')::uuid);
   RETURN jsonb_build_object('id',v_id,'deleted',true);
  END IF;
  IF p_input->>'hospitalId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.doctor_hospital_memberships m JOIN public.hospitals q ON q.id=m.hospital_id AND q.is_active WHERE m.doctor_id=d.id AND m.hospital_id=(p_input->>'hospitalId')::uuid) THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  IF p_input->>'overrideType' NOT IN ('LEAVE','EMERGENCY_BLOCK','CUSTOM_HOURS','HOLIDAY') OR (p_input->>'startDateTime')::timestamptz>=(p_input->>'endDateTime')::timestamptz OR length(coalesce(p_input->>'reason',''))>1000 THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  -- CUSTOM_HOURS narrows existing-template capacity on the touched local days;
  -- every affected slot outside the allowed interval must be unreserved.
  FOR s IN SELECT * FROM public.materialized_appointment_slots z WHERE z.doctor_id=d.id AND z.slot_start>clock_timestamp() AND z.state<>'EXPIRED'
   AND (p_input->>'hospitalId' IS NULL OR z.hospital_id=(p_input->>'hospitalId')::uuid)
   AND CASE WHEN p_input->>'overrideType'='CUSTOM_HOURS' THEN
    (z.slot_start AT TIME ZONE public.mediid_appointment_zone(z.id))::date BETWEEN ((p_input->>'startDateTime')::timestamptz AT TIME ZONE public.mediid_appointment_zone(z.id))::date AND (((p_input->>'endDateTime')::timestamptz-interval '1 microsecond') AT TIME ZONE public.mediid_appointment_zone(z.id))::date
    AND NOT (z.slot_start>=(p_input->>'startDateTime')::timestamptz AND z.slot_end<=(p_input->>'endDateTime')::timestamptz)
    AND NOT EXISTS(SELECT 1 FROM public.schedule_overrides o WHERE o.doctor_id=d.id AND o.override_type='CUSTOM_HOURS' AND (o.hospital_id IS NULL OR o.hospital_id=z.hospital_id) AND z.slot_start>=o.start_date_time AND z.slot_end<=o.end_date_time)
   ELSE tstzrange(z.slot_start,z.slot_end,'[)')&&tstzrange((p_input->>'startDateTime')::timestamptz,(p_input->>'endDateTime')::timestamptz,'[)') END ORDER BY z.id FOR UPDATE LOOP
   IF EXISTS(SELECT 1 FROM public.appointment_slot_reservations q WHERE q.slot_id=s.id AND q.status IN ('HELD','CONFIRMED')) THEN RAISE EXCEPTION 'APPOINTMENT_SCHEDULE_CONFLICT' USING ERRCODE='P0001'; END IF;
   UPDATE public.materialized_appointment_slots SET state='BLOCKED',version=version+1,updated_at=clock_timestamp() WHERE materialized_appointment_slots.id=s.id;
  END LOOP;
  v_id=coalesce(v_id,public.mediid_appointment_uuid());
  INSERT INTO public.schedule_overrides(id,doctor_id,hospital_id,override_type,start_date_time,end_date_time,reason) VALUES(v_id,d.id,(p_input->>'hospitalId')::uuid,(p_input->>'overrideType')::public."OverrideType",(p_input->>'startDateTime')::timestamptz,(p_input->>'endDateTime')::timestamptz,p_input->>'reason');
  IF p_input->>'overrideType'='CUSTOM_HOURS' THEN
   -- An additional custom window expands the union of allowed windows. Retire
   -- blocked, unoccupied metadata inside the newly allowed window; retained
   -- reservation history stays linked to its original immutable slot. The rolling
   -- materializer rechecks every current override, provider and membership before
   -- generating a canonical replacement, so another leave/block cannot be bypassed.
   UPDATE public.materialized_appointment_slots z SET state='EXPIRED',version=version+1,updated_at=clock_timestamp()
   WHERE z.doctor_id=d.id AND z.state='BLOCKED' AND z.slot_start>clock_timestamp()
    AND (p_input->>'hospitalId' IS NULL OR z.hospital_id=(p_input->>'hospitalId')::uuid)
    AND z.slot_start>=(p_input->>'startDateTime')::timestamptz AND z.slot_end<=(p_input->>'endDateTime')::timestamptz
    AND NOT EXISTS(SELECT 1 FROM public.appointment_slot_reservations q WHERE q.slot_id=z.id AND q.status IN ('HELD','CONFIRMED'));
  END IF;
  PERFORM public.mediid_appointment_reconcile_override(d.id,(p_input->>'hospitalId')::uuid);
  RETURN jsonb_build_object('id',v_id);
 END IF;
 IF p_operation='book' THEN
  IF p_input ?| ARRAY['totalFee','depositPercentage','depositAmount','holdExpiresAt','paymentHoldStatus','seatNumber','status','policySnapshot','bookedByUserId','handledByUserId','legacySourceId','legacyImportedAt','amountPaid'] THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  IF p_input->>'slotId' IS NOT NULL THEN SELECT * INTO s FROM public.materialized_appointment_slots WHERE materialized_appointment_slots.id=(p_input->>'slotId')::uuid;
  ELSE
   SELECT count(*),min(q.id::text)::uuid INTO seat,old_slot FROM public.materialized_appointment_slots q WHERE q.doctor_id=(p_input->>'doctor')::uuid AND q.hospital_id=(p_input->>'hospital')::uuid
    AND (q.slot_start AT TIME ZONE public.mediid_appointment_zone(q.id))::date=(p_input->>'appointmentDate')::date AND to_char(q.slot_start AT TIME ZONE public.mediid_appointment_zone(q.id),'HH24:MI')=p_input->>'timeSlot' AND q.state NOT IN ('BLOCKED','EXPIRED');
   IF seat<>1 THEN RAISE EXCEPTION 'APPOINTMENT_SLOT_AMBIGUOUS' USING ERRCODE='P0001'; END IF;
   SELECT * INTO s FROM public.materialized_appointment_slots WHERE materialized_appointment_slots.id=old_slot;
  END IF;
  IF s.id IS NULL OR s.hospital_id IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  SELECT * INTO h FROM public.hospitals WHERE hospitals.id=s.hospital_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  SELECT * INTO d FROM public.doctors WHERE doctors.id=s.doctor_id AND is_active FOR SHARE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.doctor_hospital_memberships WHERE doctor_id=s.doctor_id AND hospital_id=s.hospital_id) THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  selected_channel=coalesce(p_input->>'appointmentChannel','ONLINE'); source=coalesce(p_input->>'bookingChannel','ONLINE_APP');
  IF selected_channel NOT IN ('ONLINE','OFFLINE') OR source NOT IN ('ONLINE_APP','WALK_IN','PHONE','SUPPORT_ASSISTED') THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  IF role_name='patient' THEN
   IF p_input ? 'patientId' OR selected_channel<>'ONLINE' OR source<>'ONLINE_APP' THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
   SELECT * INTO patient FROM public.patients WHERE user_id=p_actor;
  ELSE
   SELECT q.* INTO patient FROM public.patients q JOIN public.users u ON u.id=q.user_id AND u.is_active AND u.role='patient' WHERE q.id::text=p_input->>'patientId' OR q.uid=p_input->>'patientId' OR EXISTS(SELECT 1 FROM public.auth_legacy_links l WHERE l.user_id=q.user_id AND l.patient_mongo_id=p_input->>'patientId' AND l.patient_mongo_id~'^[0-9a-f]{24}$');
   IF role_name='support_agent' THEN source='SUPPORT_ASSISTED';
   ELSIF h.type='clinic' THEN
    IF role_name<>'doctor' OR d.user_id IS DISTINCT FROM p_actor OR selected_channel<>'OFFLINE' OR source NOT IN ('WALK_IN','PHONE') THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
   ELSIF NOT public.mediid_appointment_frontdesk(p_actor,h.id) THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  END IF;
  IF patient.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE users.id=patient.user_id AND is_active AND role='patient') THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  p=public.mediid_appointment_policy(d.id,h.id);
  IF role_name='support_agent' AND selected_channel='OFFLINE' AND NOT (p->>'allowWalkIns')::boolean AND NOT (p->>'allowPhoneBookings')::boolean THEN RAISE EXCEPTION 'APPOINTMENT_POLICY_CONFLICT' USING ERRCODE='P0001'; END IF;
  IF (source='WALK_IN' AND NOT (p->>'allowWalkIns')::boolean) OR (source='PHONE' AND NOT (p->>'allowPhoneBookings')::boolean) THEN RAISE EXCEPTION 'APPOINTMENT_POLICY_CONFLICT' USING ERRCODE='P0001'; END IF;
  SELECT * INTO s FROM public.materialized_appointment_slots WHERE materialized_appointment_slots.id=s.id FOR UPDATE;
  IF s.slot_start<=clock_timestamp() OR s.state IN ('BLOCKED','EXPIRED') OR (selected_channel='ONLINE' AND s.channel='OFFLINE') OR (selected_channel='OFFLINE' AND s.channel='ONLINE') THEN RAISE EXCEPTION 'APPOINTMENT_SLOT_CLOSED' USING ERRCODE='P0001'; END IF;
  SELECT x INTO seat FROM generate_series(1,s.capacity) x WHERE NOT EXISTS(SELECT 1 FROM public.appointment_slot_reservations q WHERE q.slot_id=s.id AND q.seat_number=x AND q.status IN ('HELD','CONFIRMED')) ORDER BY x LIMIT 1;
  IF seat IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_CAPACITY_CONFLICT' USING ERRCODE='P0001'; END IF;
  fee=d.consultation_fee; online=selected_channel='ONLINE';
  amount=CASE WHEN NOT online THEN 0 WHEN h.type='clinic' THEN round(fee*0.5,2) WHEN (p->>'depositRequired')::boolean OR p->>'confirmationMode'='DEPOSIT' THEN coalesce((p->>'depositFixedAmount')::numeric,round(fee*(p->>'depositPercentage')::numeric/100,2)) ELSE 0 END;
  IF fee<0 OR fee='NaN'::numeric OR amount<0 OR amount>fee OR amount='NaN'::numeric OR (online AND h.type='clinic' AND amount<=0) OR (online AND p->>'confirmationMode'='DEPOSIT' AND amount<=0) THEN RAISE EXCEPTION 'APPOINTMENT_POLICY_CONFLICT' USING ERRCODE='P0001'; END IF;
  need_hold=amount>0; token=p_input->>'confirmationDigest';
  IF token IS NULL OR token!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  v_id=coalesce(v_id,public.mediid_appointment_uuid()); initial_status=CASE WHEN NOT online AND h.type='clinic' THEN 'confirmed' ELSE 'pending' END;
  t=CASE WHEN h.type='clinic' THEN 'private_clinic_appointments' ELSE 'hospital_appointments' END;
  b=jsonb_build_object('id',v_id,'patient_id',patient.id,'doctor_id',d.id,'hospital_id',h.id,'clinic_hospital_id',h.id,'slot_id',s.id,'appointment_channel',selected_channel,'booking_channel',source,'status',initial_status,'confirmation_mode',coalesce(p->>'confirmationMode','DEPOSIT'),
   'appointment_date',(s.slot_start AT TIME ZONE public.mediid_appointment_zone(s.id))::date,'time_slot',to_char(s.slot_start AT TIME ZONE public.mediid_appointment_zone(s.id),'HH24:MI'),'slot_start_time',s.slot_start,'slot_end_time',s.slot_end,'payment_hold_status',CASE WHEN need_hold THEN 'HELD' ELSE 'NONE' END,'deposit_required',need_hold,'deposit_percentage',50,'deposit_amount',amount,'total_fee',fee,'policy_snapshot',p,'confirm_token',token,'booked_by_user_id',p_actor,'handled_by_user_id',CASE WHEN role_name<>'patient' THEN p_actor END,'symptoms',p_input->>'symptoms','notes',p_input->>'notes','contact_phone',coalesce(p_input->>'contactPhone',patient.phone),'preferred_contact_method',coalesce(p_input->>'preferredContactMethod','whatsapp'));
  set_sql='id,patient_id,doctor_id,slot_id,appointment_channel,booking_channel,status,appointment_date,time_slot,slot_start_time,slot_end_time,payment_hold_status,deposit_amount,total_fee,policy_snapshot,confirm_token,booked_by_user_id,handled_by_user_id,symptoms,notes,contact_phone,preferred_contact_method';
  set_sql=set_sql||CASE WHEN h.type='clinic' THEN ',clinic_hospital_id,deposit_percentage' ELSE ',hospital_id,confirmation_mode,deposit_required' END;
  EXECUTE format('INSERT INTO public.%1$I(%2$s,updated_at) SELECT %2$s,clock_timestamp() FROM jsonb_populate_record(NULL::public.%1$I,$1)',t,set_sql) USING b;
  b=public.mediid_appointment_row(v_id,true);
  INSERT INTO public.appointment_slot_reservations(id,slot_id,hospital_appointment_id,private_clinic_appointment_id,actor_user_id,seat_number,status,expires_at)
  VALUES(coalesce((p_input->>'reservationId')::uuid,public.mediid_appointment_uuid()),s.id,CASE WHEN h.type<>'clinic' THEN v_id END,CASE WHEN h.type='clinic' THEN v_id END,p_actor,seat,CASE WHEN need_hold THEN 'HELD'::public."ReservationStatus" ELSE 'CONFIRMED'::public."ReservationStatus" END,CASE WHEN need_hold THEN (b->>'hold_expires_at')::timestamptz END);
  IF initial_status='confirmed' THEN PERFORM public.mediid_appointment_session(b); END IF;
  PERFORM public.mediid_appointment_slot_state(s.id);
  RETURN public.mediid_appointment_dto(b,p_actor);
 END IF; IF p_operation='paymentCapture' THEN
  SELECT * INTO pay FROM public.appointment_payments WHERE appointment_payments.id=(p_input->>'paymentId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  v_id=coalesce(pay.hospital_appointment_id,pay.private_clinic_appointment_id); b=public.mediid_appointment_row(v_id,true);
  IF p_actor IS NOT NULL THEN authority=public.mediid_appointment_authorized(p_actor,b); IF authority NOT IN ('PATIENT','SUPPORT_AGENT') THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF; END IF;
  SELECT * INTO pay FROM public.appointment_payments WHERE appointment_payments.id=pay.id FOR UPDATE;
  IF (p_input->>'amount' IS NOT NULL AND pay.amount<>(p_input->>'amount')::numeric) OR (p_input->>'currency' IS NOT NULL AND pay.currency IS DISTINCT FROM p_input->>'currency') OR pay.provider IS DISTINCT FROM p_input->>'provider' OR length(coalesce(p_input->>'transactionRef','')) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'APPOINTMENT_PAYMENT_CONFLICT' USING ERRCODE='P0001'; END IF;
  IF pay.status='CAPTURED' THEN
   IF pay.provider_transaction_ref IS DISTINCT FROM p_input->>'transactionRef' THEN RAISE EXCEPTION 'APPOINTMENT_PAYMENT_CONFLICT' USING ERRCODE='P0001'; END IF;
   RETURN jsonb_build_object('id',pay.id,'status',pay.status,'amount',pay.amount::text,'appointmentId',v_id,'appointment',public.mediid_appointment_dto(b,p_actor));
  END IF;
  IF pay.status NOT IN ('CREATED','AUTHORIZED') THEN RAISE EXCEPTION 'APPOINTMENT_PAYMENT_CONFLICT' USING ERRCODE='P0001'; END IF;
  SELECT * INTO r FROM public.appointment_slot_reservations WHERE (hospital_appointment_id=v_id OR private_clinic_appointment_id=v_id) AND status IN ('HELD','CONFIRMED') FOR UPDATE;
  is_late=NOT FOUND OR b->>'status' IN ('cancelled','expired','completed','rescheduled') OR (r.status='HELD' AND r.expires_at<=clock_timestamp());
  UPDATE public.appointment_payments SET status='CAPTURED',captured_at=clock_timestamp(),provider_transaction_ref=p_input->>'transactionRef' WHERE appointment_payments.id=pay.id;
  t=CASE WHEN b->>'domain'='hospital' THEN 'hospital_appointments' ELSE 'private_clinic_appointments' END;
  IF NOT is_late AND r.status='HELD' THEN UPDATE public.appointment_slot_reservations SET status='CONFIRMED' WHERE appointment_slot_reservations.id=r.id; END IF;
  IF is_late AND r.id IS NOT NULL AND r.status='HELD' THEN UPDATE public.appointment_slot_reservations SET status='EXPIRED',released_at=clock_timestamp() WHERE appointment_slot_reservations.id=r.id; END IF;
  EXECUTE format('UPDATE public.%I SET amount_paid=amount_paid+$2,payment_hold_status=$3::public."PaymentHoldStatus",status=CASE WHEN $4 AND status IN (''pending'',''reminder_sent'') THEN ''expired''::public."AppointmentStatus" ELSE status END,updated_at=clock_timestamp() WHERE id=$1',t) USING v_id,pay.amount,CASE WHEN is_late THEN 'EXPIRED' ELSE 'PAID' END,is_late;
  b=public.mediid_appointment_row(v_id);
  IF is_late THEN
   pct=CASE WHEN b->>'status'='cancelled' AND b->>'cancellation_initiator' IN ('PATIENT','SUPPORT_AGENT') THEN CASE WHEN (b->>'slot_start_time')::timestamptz-(b->>'cancelled_at')::timestamptz>=make_interval(hours=>coalesce((b->'policy_snapshot'->>'cancellationCutoffHours')::int,2)) THEN (b->'policy_snapshot'->>'patientRefundPercentage')::numeric ELSE (b->'policy_snapshot'->>'lateRefundPercentage')::numeric END ELSE 100 END;
   IF b->>'refund_resolution'<>'PATIENT_APPROVED_TRANSFER' THEN
    refund_total=public.mediid_appointment_refund_due(b,pay.actor_user_id,coalesce(pct,100),'late'); PERFORM public.mediid_appointment_refund_summary(v_id);
   ELSE
    EXECUTE format('UPDATE public.%I SET refund_status=''TRANSFER_CREDIT_OFFERED'',refund_amount=amount_paid,updated_at=clock_timestamp() WHERE id=$1',t) USING v_id;
   END IF;
  ELSIF b->>'domain'='clinic' OR b->>'confirmation_mode'='DEPOSIT' THEN PERFORM public.mediid_appointment_finalize(v_id,'payment'); END IF;
  PERFORM public.mediid_appointment_slot_state((b->>'slot_id')::uuid);
  RETURN jsonb_build_object('id',pay.id,'status','CAPTURED','amount',pay.amount::text,'appointmentId',v_id,'late',is_late,'appointment',public.mediid_appointment_dto(public.mediid_appointment_row(v_id),p_actor));
 END IF;
 IF p_operation='refundUpdate' THEN
  SELECT * INTO ref FROM public.appointment_refunds WHERE appointment_refunds.id=(p_input->>'refundId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  b=public.mediid_appointment_row(coalesce(ref.hospital_appointment_id,ref.private_clinic_appointment_id),true);
  IF p_actor IS NOT NULL THEN PERFORM public.mediid_appointment_authorized(p_actor,b,true); END IF;
  SELECT * INTO ref FROM public.appointment_refunds WHERE appointment_refunds.id=ref.id FOR UPDATE;
  IF p_input->>'status' NOT IN ('SUCCEEDED','FAILED') OR ref.provider IS DISTINCT FROM p_input->>'provider' THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  IF ref.status::text=p_input->>'status' THEN RETURN jsonb_build_object('id',ref.id,'status',ref.status); END IF;
  UPDATE public.appointment_refunds SET status=(p_input->>'status')::public."AppointmentRefundStatus",provider_transaction_ref=p_input->>'transactionRef' WHERE appointment_refunds.id=ref.id;
  PERFORM public.mediid_appointment_refund_summary(coalesce(ref.hospital_appointment_id,ref.private_clinic_appointment_id));
  RETURN jsonb_build_object('id',ref.id,'status',p_input->>'status');
 END IF;
 IF p_operation='paymentCreate' THEN
  IF length(coalesce(p_input->>'idempotencyKey','')) NOT BETWEEN 8 AND 128 OR length(coalesce(p_input->>'provider','')) NOT BETWEEN 1 AND 64 THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('appointment-payment:'||(p_input->>'idempotencyKey'),0));
 END IF;
 b=public.mediid_appointment_row(v_id,true); old_b=b; authority=public.mediid_appointment_authorized(p_actor,b);
 t=CASE WHEN b->>'domain'='hospital' THEN 'hospital_appointments' ELSE 'private_clinic_appointments' END;
 IF p_operation='paymentCreate' THEN
  IF authority NOT IN ('PATIENT','SUPPORT_AGENT') THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  SELECT * INTO pay FROM public.appointment_payments WHERE idempotency_key=p_input->>'idempotencyKey';
  IF FOUND THEN
   IF coalesce(pay.hospital_appointment_id,pay.private_clinic_appointment_id)<>v_id OR pay.provider IS DISTINCT FROM p_input->>'provider' OR pay.actor_user_id<>p_actor OR pay.created_at<(b->>'booked_at')::timestamptz OR (p_input->>'amount' IS NOT NULL AND pay.amount<>(p_input->>'amount')::numeric) THEN RAISE EXCEPTION 'APPOINTMENT_PAYMENT_CONFLICT' USING ERRCODE='P0001'; END IF;
  ELSE
   IF b->>'status' NOT IN ('pending','reminder_sent','confirmed','checked_in') THEN RAISE EXCEPTION 'APPOINTMENT_PAYMENT_CONFLICT' USING ERRCODE='P0001'; END IF;
   SELECT * INTO r FROM public.appointment_slot_reservations WHERE (hospital_appointment_id=v_id OR private_clinic_appointment_id=v_id) AND status IN ('HELD','CONFIRMED') FOR UPDATE;
   IF NOT FOUND OR (r.status='HELD' AND r.expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'APPOINTMENT_HOLD_EXPIRED' USING ERRCODE='P0001'; END IF;
   amount=CASE WHEN b->>'appointment_channel'='ONLINE' THEN (b->>'deposit_amount')::numeric ELSE (b->>'total_fee')::numeric END-(b->>'amount_paid')::numeric;
   IF amount<=0 OR EXISTS(SELECT 1 FROM public.appointment_payments WHERE (hospital_appointment_id=v_id OR private_clinic_appointment_id=v_id) AND status IN ('CREATED','AUTHORIZED')) THEN RAISE EXCEPTION 'APPOINTMENT_PAYMENT_CONFLICT' USING ERRCODE='P0001'; END IF;
   INSERT INTO public.appointment_payments(id,hospital_appointment_id,private_clinic_appointment_id,actor_user_id,amount,currency,provider,idempotency_key,created_at)
   VALUES(coalesce((p_input->>'paymentId')::uuid,public.mediid_appointment_uuid()),CASE WHEN b->>'domain'='hospital' THEN v_id END,CASE WHEN b->>'domain'='clinic' THEN v_id END,p_actor,amount,b->>'currency',p_input->>'provider',p_input->>'idempotencyKey',clock_timestamp()) RETURNING * INTO pay;
  END IF;
  RETURN jsonb_build_object('id',pay.id,'appointmentId',v_id,'domain',b->>'domain','amount',pay.amount::text,'currency',pay.currency,'provider',pay.provider,'idempotencyKey',pay.idempotency_key,'status',pay.status,'transactionRef',pay.provider_transaction_ref,'actorUserId',pay.actor_user_id);
 END IF;
 IF p_operation IN ('confirm','notificationToken') THEN
  IF authority<>'PATIENT' THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  IF b->>'status' NOT IN ('pending','reminder_sent','confirmed') OR (b->>'slot_start_time')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'APPOINTMENT_CONFIRM_INVALID' USING ERRCODE='P0001'; END IF;
  IF p_operation='notificationToken' THEN
   IF p_input->>'confirmationDigest'!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
   EXECUTE format('UPDATE public.%I SET confirm_token=$2,confirm_token_used=false,updated_at=clock_timestamp() WHERE id=$1',t) USING v_id,p_input->>'confirmationDigest';
  ELSE
   EXECUTE format('UPDATE public.%I SET patient_confirmed_at=coalesce(patient_confirmed_at,clock_timestamp()),confirm_token_used=true,updated_at=clock_timestamp() WHERE id=$1',t) USING v_id;
  END IF;
  RETURN public.mediid_appointment_dto(public.mediid_appointment_row(v_id),p_actor);
 END IF;
 IF p_operation='transferApproval' THEN
  IF authority<>'PATIENT' OR b->>'status' NOT IN ('pending','reminder_sent','confirmed') OR NOT coalesce((b->'policy_snapshot'->>'allowPatientApprovedTransfer')::boolean,false) OR p_input->>'approved'<>'true' THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  EXECUTE format('UPDATE public.%I SET refund_resolution=''PATIENT_APPROVED_TRANSFER'',transfer_approved_by_user_id=$2,transfer_approved_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1',t) USING v_id,p_actor;
  RETURN public.mediid_appointment_dto(public.mediid_appointment_row(v_id),p_actor);
 END IF;
 IF p_operation='cancel' THEN
  -- Hospital cancellation is front-desk owned; private cancellation is exact-doctor owned.
  IF authority='DOCTOR' AND b->>'domain'='hospital' THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  IF b->>'status'='cancelled' THEN RETURN public.mediid_appointment_dto(b,p_actor); END IF;
  IF b->>'status' NOT IN ('pending','reminder_sent','confirmed','checked_in') THEN RAISE EXCEPTION 'APPOINTMENT_TRANSITION' USING ERRCODE='P0001'; END IF;
  pct=CASE WHEN authority IN ('DOCTOR','HOSPITAL_FRONT_DESK') THEN 100 WHEN (b->>'slot_start_time')::timestamptz-clock_timestamp()>=make_interval(hours=>coalesce((b->'policy_snapshot'->>'cancellationCutoffHours')::int,2)) THEN coalesce((b->'policy_snapshot'->>'patientRefundPercentage')::numeric,100) ELSE coalesce((b->'policy_snapshot'->>'lateRefundPercentage')::numeric,0) END;
  EXECUTE format('UPDATE public.%I SET status=''cancelled'',cancellation_initiator=$2::public."CancellationInitiator",cancelled_at=clock_timestamp(),cancellation_reason=$3,handled_by_user_id=$4,payment_hold_status=CASE WHEN payment_hold_status IN (''HELD'',''PENDING'') THEN ''RELEASED''::public."PaymentHoldStatus" ELSE payment_hold_status END,updated_at=clock_timestamp() WHERE id=$1',t) USING v_id,authority,left(p_input->>'reason',1000),p_actor;
  b=public.mediid_appointment_row(v_id);
  IF b->>'refund_resolution'='PATIENT_APPROVED_TRANSFER' THEN
   EXECUTE format('UPDATE public.%I SET refund_status=''TRANSFER_CREDIT_OFFERED'',refund_amount=amount_paid,updated_at=clock_timestamp() WHERE id=$1',t) USING v_id;
  ELSE
   refund_total=public.mediid_appointment_refund_due(b,p_actor,pct,'cancel');
   EXECUTE format('UPDATE public.%I SET refund_status=CASE WHEN $2>0 THEN ''PENDING''::public."RefundStatus" ELSE ''NOT_APPLICABLE''::public."RefundStatus" END,refund_amount=$2,updated_at=clock_timestamp() WHERE id=$1',t) USING v_id,refund_total;
  END IF;
  UPDATE public.consultation_sessions SET status='expired' WHERE (hospital_appointment_id=v_id OR private_clinic_appointment_id=v_id) AND status IN ('scheduled','active');
  PERFORM public.mediid_appointment_slot_state((b->>'slot_id')::uuid);
  IF b->>'refund_resolution'<>'PATIENT_APPROVED_TRANSFER' THEN PERFORM public.mediid_appointment_refund_summary(v_id); END IF;
  RETURN public.mediid_appointment_dto(public.mediid_appointment_row(v_id),p_actor);
 END IF;
 IF p_operation='status' THEN
  IF authority NOT IN ('HOSPITAL_FRONT_DESK','DOCTOR') THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  initial_status=p_input->>'status';
  IF p_input ? 'staffNotes' THEN
   IF authority<>'HOSPITAL_FRONT_DESK' OR length(coalesce(p_input->>'staffNotes',''))>1000 THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
   EXECUTE format('UPDATE public.%I SET staff_notes=$2,updated_at=clock_timestamp() WHERE id=$1',t) USING v_id,p_input->>'staffNotes';
  END IF;
  IF initial_status='confirmed' THEN
   IF b->>'domain'='hospital' AND authority<>'HOSPITAL_FRONT_DESK' THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
   IF b->>'domain'='hospital' AND b->>'appointment_channel'='ONLINE' AND b->>'confirmation_mode'<>'MANUAL' THEN RAISE EXCEPTION 'APPOINTMENT_POLICY_CONFLICT' USING ERRCODE='P0001'; END IF;
   IF NOT public.mediid_appointment_finalize(v_id,'manual') AND b->>'status'<>'confirmed' THEN RAISE EXCEPTION 'APPOINTMENT_PAYMENT_REQUIRED' USING ERRCODE='P0001'; END IF;
  ELSIF (initial_status='checked_in' AND b->>'status'='confirmed') OR (initial_status='completed' AND b->>'status'='checked_in') THEN
   EXECUTE format('UPDATE public.%I SET status=$2::public."AppointmentStatus",updated_at=clock_timestamp() WHERE id=$1',t) USING v_id,initial_status;
   IF initial_status='completed' THEN
    UPDATE public.consultation_sessions SET status='completed',completed_at=clock_timestamp() WHERE (hospital_appointment_id=v_id OR private_clinic_appointment_id=v_id) AND status IN ('scheduled','active');
    PERFORM public.mediid_appointment_slot_state((b->>'slot_id')::uuid);
   END IF;
  ELSIF initial_status=b->>'status' AND initial_status IN ('checked_in','completed') THEN NULL;
  ELSE RAISE EXCEPTION 'APPOINTMENT_TRANSITION' USING ERRCODE='P0001'; END IF;
  RETURN public.mediid_appointment_dto(public.mediid_appointment_row(v_id),p_actor);
 END IF;
 IF p_operation='reschedule' THEN
  IF EXISTS(SELECT 1 FROM public.appointment_payments WHERE (hospital_appointment_id=v_id OR private_clinic_appointment_id=v_id) AND status IN ('CREATED','AUTHORIZED')) THEN RAISE EXCEPTION 'APPOINTMENT_PAYMENT_CONFLICT' USING ERRCODE='P0001'; END IF;
  IF p_input->>'confirmationDigest' IS NULL OR p_input->>'confirmationDigest'!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001'; END IF;
  IF authority='DOCTOR' AND b->>'domain'='hospital' THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  IF b->>'status' NOT IN ('pending','reminder_sent','confirmed') OR (b->>'slot_start_time')::timestamptz-clock_timestamp()<make_interval(hours=>coalesce((b->'policy_snapshot'->>'rescheduleCutoffHours')::int,2)) OR (b->>'reschedule_count')::int>=coalesce((b->'policy_snapshot'->>'maxRescheduleCount')::int,2) THEN RAISE EXCEPTION 'APPOINTMENT_POLICY_CONFLICT' USING ERRCODE='P0001'; END IF;
  old_slot=(b->>'slot_id')::uuid;
  IF (p_input->>'slotId')::uuid=old_slot OR (p_input->>'expectedSlotId' IS NOT NULL AND (p_input->>'expectedSlotId')::uuid<>old_slot) THEN RAISE EXCEPTION 'APPOINTMENT_SCHEDULE_CONFLICT' USING ERRCODE='P0001'; END IF;
  SELECT * INTO h FROM public.hospitals WHERE hospitals.id=coalesce(b->>'hospital_id',b->>'clinic_hospital_id')::uuid AND is_active FOR SHARE;
  SELECT * INTO d FROM public.doctors WHERE doctors.id=(b->>'doctor_id')::uuid AND is_active FOR SHARE;
  IF h.id IS NULL OR d.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.doctor_hospital_memberships WHERE doctor_id=d.id AND hospital_id=h.id) THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  PERFORM z.id FROM public.materialized_appointment_slots z WHERE z.id IN (old_slot,(p_input->>'slotId')::uuid) ORDER BY z.id FOR UPDATE;
  SELECT * INTO s FROM public.materialized_appointment_slots WHERE materialized_appointment_slots.id=(p_input->>'slotId')::uuid;
  IF s.id IS NULL OR s.doctor_id<>d.id OR s.hospital_id IS DISTINCT FROM h.id OR s.state IN ('BLOCKED','EXPIRED') OR s.slot_start<=clock_timestamp() OR (b->>'appointment_channel'='ONLINE' AND s.channel='OFFLINE') OR (b->>'appointment_channel'='OFFLINE' AND s.channel='ONLINE') THEN RAISE EXCEPTION 'APPOINTMENT_SLOT_CLOSED' USING ERRCODE='P0001'; END IF;
  SELECT x INTO seat FROM generate_series(1,s.capacity) x WHERE NOT EXISTS(SELECT 1 FROM public.appointment_slot_reservations q WHERE q.slot_id=s.id AND q.seat_number=x AND q.status IN ('HELD','CONFIRMED')) ORDER BY x LIMIT 1;
  IF seat IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_CAPACITY_CONFLICT' USING ERRCODE='P0001'; END IF;
  p=public.mediid_appointment_policy(d.id,h.id); fee=d.consultation_fee;
  amount=CASE WHEN b->>'appointment_channel'='OFFLINE' THEN 0 WHEN h.type='clinic' THEN round(fee*0.5,2) WHEN (p->>'depositRequired')::boolean OR p->>'confirmationMode'='DEPOSIT' THEN coalesce((p->>'depositFixedAmount')::numeric,round(fee*(p->>'depositPercentage')::numeric/100,2)) ELSE 0 END;
  IF fee<0 OR fee='NaN'::numeric OR amount>fee OR amount<0 OR amount='NaN'::numeric OR (b->>'amount_paid')::numeric>fee THEN RAISE EXCEPTION 'APPOINTMENT_POLICY_CONFLICT' USING ERRCODE='P0001'; END IF;
  need_hold=amount>(b->>'amount_paid')::numeric;
  UPDATE public.appointment_slot_reservations SET status='RELEASED',released_at=clock_timestamp() WHERE (hospital_appointment_id=v_id OR private_clinic_appointment_id=v_id) AND status IN ('HELD','CONFIRMED');
  initial_status=CASE WHEN NOT need_hold AND (h.type='clinic' OR (b->>'appointment_channel'='ONLINE' AND p->>'confirmationMode'='DEPOSIT')) THEN 'confirmed' ELSE 'pending' END;
  EXECUTE format('UPDATE public.%I SET slot_id=$2,slot_start_time=$3,slot_end_time=$4,appointment_date=($3 AT TIME ZONE public.mediid_appointment_zone($2))::date,time_slot=to_char($3 AT TIME ZONE public.mediid_appointment_zone($2),''HH24:MI''),policy_snapshot=$5,total_fee=$6,deposit_amount=$7,payment_hold_status=$8::public."PaymentHoldStatus",hold_expires_at=NULL,reschedule_count=reschedule_count+1,refund_resolution=''REFUND'',transfer_approved_by_user_id=NULL,transfer_approved_at=NULL,status=$9::public."AppointmentStatus",confirm_token_used=false,patient_confirmed_at=NULL,confirmed_at=CASE WHEN $9=''confirmed'' THEN clock_timestamp() ELSE NULL END,confirmation_method=CASE WHEN $9=''confirmed'' THEN ''reschedule_payment_satisfied'' ELSE NULL END,confirm_token=$10,handled_by_user_id=$11,updated_at=clock_timestamp()%s WHERE id=$1',t,CASE WHEN h.type<>'clinic' THEN ',confirmation_mode=($5->>''confirmationMode'')::public."HospitalConfirmationMode",deposit_required=($7>0)' ELSE '' END)
   USING v_id,s.id,s.slot_start,s.slot_end,p,fee,amount,CASE WHEN need_hold THEN 'HELD' WHEN amount>0 THEN 'PAID' ELSE 'NONE' END,initial_status,p_input->>'confirmationDigest',p_actor;
  b=public.mediid_appointment_row(v_id);
  INSERT INTO public.appointment_slot_reservations(id,slot_id,hospital_appointment_id,private_clinic_appointment_id,actor_user_id,seat_number,status,expires_at) VALUES(coalesce((p_input->>'reservationId')::uuid,public.mediid_appointment_uuid()),s.id,CASE WHEN h.type<>'clinic' THEN v_id END,CASE WHEN h.type='clinic' THEN v_id END,p_actor,seat,CASE WHEN need_hold THEN 'HELD'::public."ReservationStatus" ELSE 'CONFIRMED'::public."ReservationStatus" END,CASE WHEN need_hold THEN (b->>'hold_expires_at')::timestamptz END);
  UPDATE public.consultation_sessions SET starts_at=s.slot_start-interval '10 minutes',expires_at=s.slot_start+interval '2 hours',status='scheduled',completed_at=NULL WHERE hospital_appointment_id=v_id OR private_clinic_appointment_id=v_id;
  IF initial_status='confirmed' THEN PERFORM public.mediid_appointment_session(b); END IF;
  PERFORM public.mediid_appointment_slot_state(old_slot); PERFORM public.mediid_appointment_slot_state(s.id);
  RETURN public.mediid_appointment_dto(b,p_actor);
 END IF;
 IF p_operation='refundCreate' THEN
  IF authority NOT IN ('HOSPITAL_FRONT_DESK','DOCTOR') OR b->>'status' NOT IN ('cancelled','expired') THEN RAISE EXCEPTION 'APPOINTMENT_FORBIDDEN' USING ERRCODE='P0001'; END IF;
  pct=CASE WHEN b->>'cancellation_initiator' IN ('DOCTOR','HOSPITAL_FRONT_DESK') OR b->>'status'='expired' THEN 100 WHEN (b->>'slot_start_time')::timestamptz-(b->>'cancelled_at')::timestamptz>=make_interval(hours=>coalesce((b->'policy_snapshot'->>'cancellationCutoffHours')::int,2)) THEN coalesce((b->'policy_snapshot'->>'patientRefundPercentage')::numeric,100) ELSE coalesce((b->'policy_snapshot'->>'lateRefundPercentage')::numeric,0) END;
  refund_total=public.mediid_appointment_refund_due(b,p_actor,pct,'retry'); RETURN jsonb_build_object('amount',refund_total::text);
 END IF;
 RAISE EXCEPTION 'APPOINTMENT_INPUT' USING ERRCODE='P0001';
END $$;
CREATE FUNCTION public.mediid_appointment_public_confirm(p_digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid; b jsonb; t text;
BEGIN
 IF p_digest IS NULL OR p_digest!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'APPOINTMENT_CONFIRM_INVALID' USING ERRCODE='P0001'; END IF;
 SELECT q.id INTO v_id FROM (SELECT a.id FROM public.hospital_appointments a WHERE confirm_token=p_digest UNION ALL SELECT a.id FROM public.private_clinic_appointments a WHERE confirm_token=p_digest) q;
 IF v_id IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_CONFIRM_INVALID' USING ERRCODE='P0001'; END IF;
 b=public.mediid_appointment_row(v_id,true);
 IF b->>'confirm_token' IS DISTINCT FROM p_digest OR (b->>'confirm_token_used')::boolean OR b->>'status' NOT IN ('pending','reminder_sent','confirmed') OR (b->>'slot_start_time')::timestamptz<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM public.appointment_slot_reservations WHERE (hospital_appointment_id=v_id OR private_clinic_appointment_id=v_id) AND (status='CONFIRMED' OR status='HELD' AND expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'APPOINTMENT_CONFIRM_INVALID' USING ERRCODE='P0001'; END IF;
 t=CASE WHEN b->>'domain'='hospital' THEN 'hospital_appointments' ELSE 'private_clinic_appointments' END;
 EXECUTE format('UPDATE public.%I SET confirm_token_used=true,patient_confirmed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1',t) USING v_id;
 RETURN jsonb_build_object('acknowledged',true,'status',b->>'status','message','Patient acknowledgement recorded');
END $$;

CREATE FUNCTION public.mediid_appointment_tick() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE q record; r public.appointment_slot_reservations; b jsonb; t text; n_expired int=0; n_confirmed int=0; n_active int; n_windows_expired int;
BEGIN
 FOR q IN SELECT coalesce(hospital_appointment_id,private_clinic_appointment_id) id FROM public.appointment_slot_reservations WHERE status='HELD' AND expires_at<=clock_timestamp() ORDER BY coalesce(hospital_appointment_id,private_clinic_appointment_id) LIMIT 1000 LOOP
  b=public.mediid_appointment_row(q.id,true);
  SELECT * INTO r FROM public.appointment_slot_reservations WHERE (hospital_appointment_id=q.id OR private_clinic_appointment_id=q.id) AND status='HELD' AND expires_at<=clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  UPDATE public.appointment_slot_reservations SET status='EXPIRED',released_at=clock_timestamp() WHERE id=r.id;
  t=CASE WHEN b->>'domain'='hospital' THEN 'hospital_appointments' ELSE 'private_clinic_appointments' END;
  EXECUTE format('UPDATE public.%I SET status=CASE WHEN status IN (''pending'',''reminder_sent'') THEN ''expired''::public."AppointmentStatus" ELSE status END,payment_hold_status=''EXPIRED'',updated_at=clock_timestamp() WHERE id=$1',t) USING q.id;
  UPDATE public.consultation_sessions SET status='expired' WHERE (hospital_appointment_id=q.id OR private_clinic_appointment_id=q.id) AND status IN ('scheduled','active');
  PERFORM public.mediid_appointment_slot_state(r.slot_id); n_expired=n_expired+1;
 END LOOP;
 FOR q IN SELECT id FROM public.hospital_appointments WHERE status IN ('pending','reminder_sent') AND confirmation_mode='TIME_BASED'
  AND slot_start_time>clock_timestamp() AND slot_start_time-make_interval(mins=>coalesce((policy_snapshot->>'confirmationLeadMinutes')::int,40))<=clock_timestamp() ORDER BY id LIMIT 1000 LOOP
  IF public.mediid_appointment_finalize(q.id,'time_based') THEN n_confirmed=n_confirmed+1; END IF;
 END LOOP;
 UPDATE public.consultation_sessions s SET status='active' WHERE s.status='scheduled' AND s.starts_at<=clock_timestamp() AND s.expires_at>clock_timestamp()
 AND (EXISTS(SELECT 1 FROM public.hospital_appointments a WHERE a.id=s.hospital_appointment_id AND a.status IN ('confirmed','checked_in')) OR EXISTS(SELECT 1 FROM public.private_clinic_appointments a WHERE a.id=s.private_clinic_appointment_id AND a.status IN ('confirmed','checked_in')));
 GET DIAGNOSTICS n_active=ROW_COUNT;
 UPDATE public.consultation_sessions SET status='expired' WHERE status IN ('scheduled','active') AND expires_at<=clock_timestamp(); GET DIAGNOSTICS n_windows_expired=ROW_COUNT;
 RETURN jsonb_build_object('expiredHolds',n_expired,'confirmed',n_confirmed,'activatedWindows',n_active,'expiredWindows',n_windows_expired);
END $$;

CREATE FUNCTION public.mediid_appointment_reminders() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE q record; b jsonb; result jsonb='[]'; changed int; t text;
BEGIN
 FOR q IN
 SELECT a.id,'reminder'::text kind FROM public.hospital_appointments a WHERE status IN ('pending','confirmed') AND slot_start_time BETWEEN clock_timestamp() AND clock_timestamp()+interval '24 hours'
 UNION ALL SELECT a.id,'reminder' FROM public.private_clinic_appointments a WHERE status IN ('pending','confirmed') AND slot_start_time BETWEEN clock_timestamp() AND clock_timestamp()+interval '24 hours'
 UNION ALL SELECT a.id,status::text FROM public.hospital_appointments a WHERE status IN ('confirmed','cancelled','expired','completed') AND updated_at>clock_timestamp()-interval '7 days'
 UNION ALL SELECT a.id,status::text FROM public.private_clinic_appointments a WHERE status IN ('confirmed','cancelled','expired','completed') AND updated_at>clock_timestamp()-interval '7 days' LIMIT 1000 LOOP
  b=public.mediid_appointment_row(q.id,true);
  IF q.kind='reminder' THEN
   IF b->>'status' NOT IN ('pending','confirmed') OR (b->>'slot_start_time')::timestamptz<=clock_timestamp() THEN CONTINUE; END IF;
  ELSIF b->>'status' IS DISTINCT FROM q.kind THEN CONTINUE; END IF;
  INSERT INTO public.appointment_notification_claims(hospital_appointment_id,private_clinic_appointment_id,kind,epoch)
  VALUES(CASE WHEN b->>'domain'='hospital' THEN q.id END,CASE WHEN b->>'domain'='clinic' THEN q.id END,q.kind,(b->>'booked_at')::timestamptz) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed=0 THEN CONTINUE; END IF;
  IF q.kind='reminder' AND b->>'status'='pending' THEN
   t=CASE WHEN b->>'domain'='hospital' THEN 'hospital_appointments' ELSE 'private_clinic_appointments' END;
   EXECUTE format('UPDATE public.%I SET status=''reminder_sent'',updated_at=clock_timestamp() WHERE id=$1',t) USING q.id;
  END IF;
  result=result||jsonb_build_array(jsonb_build_object('appointmentId',q.id,'notificationKind',q.kind,'contactPhone',b->>'contact_phone','email',(SELECT u.email FROM public.patients p JOIN public.users u ON u.id=p.user_id WHERE p.id=(b->>'patient_id')::uuid),'slotStart',b->>'slot_start_time','status',b->>'status'));
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION public.mediid_appointment_payments() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'appointmentId',coalesce(hospital_appointment_id,private_clinic_appointment_id),'actorUserId',actor_user_id,'amount',amount::text,'currency',currency,'provider',provider,'idempotencyKey',idempotency_key,'status',status)),'[]') FROM (SELECT * FROM public.appointment_payments WHERE status IN ('CREATED','AUTHORIZED') ORDER BY created_at,id LIMIT 1000) q $$;
CREATE FUNCTION public.mediid_appointment_refunds() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.appointment_refunds; result jsonb='[]'; b jsonb;
BEGIN
 FOR r IN SELECT * FROM public.appointment_refunds WHERE status IN ('REQUESTED','PROCESSING') ORDER BY id LIMIT 1000 LOOP
  b=public.mediid_appointment_row(coalesce(r.hospital_appointment_id,r.private_clinic_appointment_id),true);
  SELECT a.* INTO r FROM public.appointment_refunds a WHERE a.id=r.id FOR UPDATE;
  IF r.status NOT IN ('REQUESTED','PROCESSING') THEN CONTINUE; END IF;
  IF r.status='REQUESTED' THEN UPDATE public.appointment_refunds SET status='PROCESSING' WHERE id=r.id; END IF;
  result=result||jsonb_build_array(jsonb_build_object('id',r.id,'refundId',r.id,'paymentId',r.payment_id,'appointmentId',coalesce(r.hospital_appointment_id,r.private_clinic_appointment_id),'actorUserId',r.actor_user_id,'amount',r.amount::text,'currency',r.currency,'provider',r.provider,'idempotencyKey',r.idempotency_key,'status','PROCESSING','paymentTransactionRef',(SELECT provider_transaction_ref FROM public.appointment_payments WHERE id=r.payment_id)));
 END LOOP; RETURN result;
END $$;

-- No direct writes or secret-bearing table reads are granted. Helpers and triggers
-- are callable only by their owner; runtime receives the deliberately bounded API.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'mediid_appointment_%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,mediid_runtime,mediid_diagnostics',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.mediid_appointment_read(uuid,text,jsonb),public.mediid_appointment_command(uuid,text,jsonb),
 public.mediid_appointment_public_confirm(text),public.mediid_appointment_materialize(integer),public.mediid_appointment_tick(),
 public.mediid_appointment_reminders(),public.mediid_appointment_payments(),public.mediid_appointment_refunds() TO mediid_runtime;
COMMIT;