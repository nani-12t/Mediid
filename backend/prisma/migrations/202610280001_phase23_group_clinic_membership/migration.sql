-- Phase 2.3 external-review correction: group private-clinic practitioners.
-- Forward-only: one owner controls membership; every doctor controls only their calendar.
BEGIN;

-- Private helper: the authenticated actor is rechecked from current PostgreSQL state.
-- Lock clinic before doctor rows. NO KEY UPDATE preserves ownership state and
-- serializes membership changes while allowing template foreign-key KEY SHARE locks.
-- Doctor rows use stable UUID order so two clinic owners adding one another cannot
-- deadlock through opposite owner/target locks. Availability uses this same target-
-- doctor lock, serializing its membership check with membership removal.
CREATE FUNCTION public.mediid_clinic_membership_scope(
 p_actor uuid,p_clinic uuid,p_doctor uuid,p_require_active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_owner uuid; v_target_user uuid;
BEGIN
 PERFORM 1 FROM public.users WHERE id=p_actor AND is_active AND role='doctor' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 SELECT h.clinic_owner_doctor_id INTO v_owner
 FROM public.hospitals h JOIN public.doctors d ON d.id=h.clinic_owner_doctor_id
 WHERE h.id=p_clinic AND h.type='clinic' AND h.is_active AND d.user_id=p_actor AND d.is_active
 FOR NO KEY UPDATE OF h;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 SELECT d.user_id INTO v_target_user FROM public.doctors d WHERE d.id=p_doctor;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 -- Hold linked identity state stable for additions. Inactive departed doctors may
 -- still be removed without deleting or changing their profile or user account.
 IF p_require_active AND v_target_user IS NOT NULL THEN
  PERFORM 1 FROM public.users WHERE id=v_target_user AND is_active AND role='doctor' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 END IF;
 PERFORM d.id FROM public.doctors d WHERE d.id IN (v_owner,p_doctor) ORDER BY d.id FOR UPDATE;
 PERFORM 1 FROM public.doctors WHERE id=v_owner AND user_id=p_actor AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 PERFORM 1 FROM public.doctors d WHERE d.id=p_doctor
  AND d.user_id IS NOT DISTINCT FROM v_target_user
  AND (NOT p_require_active OR (d.is_active AND (d.user_id IS NULL OR EXISTS(
   SELECT 1 FROM public.users u WHERE u.id=d.user_id AND u.is_active AND u.role='doctor'))));
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 RETURN v_owner;
END $$;

CREATE FUNCTION public.mediid_add_clinic_doctor_membership(
 p_actor uuid,p_clinic uuid,p_doctor uuid,p_membership uuid,p_audit uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_owner uuid;
BEGIN
 v_owner=public.mediid_clinic_membership_scope(p_actor,p_clinic,p_doctor,true);
 IF EXISTS(SELECT 1 FROM public.doctor_hospital_memberships WHERE doctor_id=p_doctor AND hospital_id=p_clinic)
 THEN RAISE EXCEPTION 'AUTH_CONFLICT' USING ERRCODE='P0001'; END IF;
 -- Membership management does not choose another doctor's primary organization.
 INSERT INTO public.doctor_hospital_memberships(id,doctor_id,hospital_id,is_primary)
 VALUES(p_membership,p_doctor,p_clinic,false);
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,doctor_id,hospital_id,details)
 VALUES(p_audit,p_actor,'clinic_membership_added',p_doctor,p_clinic,
  jsonb_build_object('membershipId',p_membership,'clinicOwnerDoctorId',v_owner,'isPrimary',false));
 RETURN p_membership;
END $$;

CREATE FUNCTION public.mediid_remove_clinic_doctor_membership(
 p_actor uuid,p_clinic uuid,p_doctor uuid,p_audit uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_owner uuid; v_membership uuid; v_primary boolean;
BEGIN
 v_owner=public.mediid_clinic_membership_scope(p_actor,p_clinic,p_doctor,false);
 IF p_doctor=v_owner THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 DELETE FROM public.doctor_hospital_memberships WHERE doctor_id=p_doctor AND hospital_id=p_clinic
 RETURNING id,is_primary INTO v_membership,v_primary;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 -- Clear stale/removed primary metadata without promoting or changing any unrelated
 -- membership or acquiring another organization's foreign-key locks.
 UPDATE public.doctors SET primary_hospital_id=NULL,updated_at=clock_timestamp()
 WHERE id=p_doctor AND (primary_hospital_id=p_clinic OR v_primary);
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,doctor_id,hospital_id,details)
 VALUES(p_audit,p_actor,'clinic_membership_removed',p_doctor,p_clinic,
  jsonb_build_object('membershipId',v_membership,'clinicOwnerDoctorId',v_owner,'wasPrimary',v_primary));
 RETURN true;
END $$;


CREATE OR REPLACE FUNCTION public.mediid_save_availability_template(p_actor uuid,p_template uuid,p_audit uuid,p_input jsonb,p_is_create boolean)
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
 -- Explicit membership authorizes hospital and group-clinic context equally.
 -- The current doctor still owns every template; primary_hospital_id grants nothing.
 IF v_row.hospital_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.doctor_hospital_memberships m JOIN public.hospitals h ON h.id=m.hospital_id
   WHERE m.doctor_id=v_doctor AND m.hospital_id=v_row.hospital_id AND h.is_active)
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

REVOKE ALL ON FUNCTION public.mediid_clinic_membership_scope(uuid,uuid,uuid,boolean)
 FROM PUBLIC,mediid_runtime,mediid_diagnostics;
REVOKE ALL ON FUNCTION public.mediid_add_clinic_doctor_membership(uuid,uuid,uuid,uuid,uuid),
 public.mediid_remove_clinic_doctor_membership(uuid,uuid,uuid,uuid),
 public.mediid_save_availability_template(uuid,uuid,uuid,jsonb,boolean)
 FROM PUBLIC,mediid_diagnostics;
GRANT EXECUTE ON FUNCTION public.mediid_add_clinic_doctor_membership(uuid,uuid,uuid,uuid,uuid),
 public.mediid_remove_clinic_doctor_membership(uuid,uuid,uuid,uuid),
 public.mediid_save_availability_template(uuid,uuid,uuid,jsonb,boolean)
 TO mediid_runtime;
COMMIT;
