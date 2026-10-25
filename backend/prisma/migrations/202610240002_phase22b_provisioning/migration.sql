-- Phase 2.2B: narrowly scoped, attributable doctor provisioning and activation.
ALTER TYPE public."UserRole" ADD VALUE IF NOT EXISTS 'hospital_staff';
BEGIN;
ALTER TABLE public.hospital_memberships ADD COLUMN user_id uuid;
ALTER TABLE public.hospital_memberships ADD CONSTRAINT hospital_memberships_user_id_fkey
 FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX hospital_memberships_user_id_key ON public.hospital_memberships(user_id);
-- Existing conflicting primary memberships require explicit reconciliation.
CREATE UNIQUE INDEX doctor_membership_one_primary ON public.doctor_hospital_memberships(doctor_id) WHERE is_primary;
CREATE TABLE public.doctor_activation_credentials (
 id uuid PRIMARY KEY,
 doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
 issued_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 token_digest varchar(64) NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz(6) NOT NULL,
 consumed_at timestamptz(6),
 created_at timestamptz(6) NOT NULL DEFAULT now(),
 CONSTRAINT doctor_activation_expiry CHECK (expires_at > created_at),
 CONSTRAINT doctor_activation_consumption CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
CREATE INDEX doctor_activation_credentials_doctor_id_idx ON public.doctor_activation_credentials(doctor_id);
CREATE TABLE public.auth_provisioning_audit (
 id uuid PRIMARY KEY,
 actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 action text NOT NULL,
 doctor_id uuid,
 hospital_id uuid,
 staff_id uuid,
 occurred_at timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX auth_provisioning_audit_actor_user_id_occurred_at_idx ON public.auth_provisioning_audit(actor_user_id,occurred_at);

-- The actor must come from the authenticated principal. Always recheck current
-- database state; caller-supplied role claims and primary_hospital_id grant nothing.
-- Consistent actor/hospital/doctor lock order serializes conflicting mutations.
CREATE FUNCTION public.mediid_provisioning_hospital(p_actor uuid,p_hospital uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.users WHERE id=p_actor AND is_active AND role='hospital_admin' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 PERFORM 1 FROM public.hospitals WHERE id=p_hospital AND user_id=p_actor AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
END $$;

CREATE FUNCTION public.mediid_provision_doctor(
 p_actor uuid,p_hospital uuid,p_doctor uuid,p_membership uuid,p_credential uuid,p_audit uuid,
 p_email text,p_first text,p_last text,p_specialization text,p_primary boolean,p_digest text,p_expires timestamptz)
RETURNS TABLE(doctor_id uuid,uid text,hospital_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_uid text; v_hospital_uid text; v_sequence integer;
BEGIN
 PERFORM public.mediid_provisioning_hospital(p_actor,p_hospital);
 IF p_first IS NULL OR btrim(p_first)='' OR length(p_first)>100 OR p_last IS NULL OR btrim(p_last)='' OR length(p_last)>100
 OR p_specialization IS NULL OR btrim(p_specialization)='' OR length(p_specialization)>150 OR p_primary IS NULL
 OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR p_expires IS NULL OR p_expires<=clock_timestamp()
 OR p_expires>clock_timestamp()+interval '7 days'
 OR (p_email IS NOT NULL AND (p_email<>lower(btrim(p_email)) OR length(p_email)>255 OR p_email !~ '^[!-~]+$' OR position('@' IN p_email)<2))
 THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
 UPDATE public.hospitals SET doctor_sequence=doctor_sequence+1,updated_at=clock_timestamp() WHERE id=p_hospital
 RETURNING hospitals.uid,doctor_sequence INTO v_hospital_uid,v_sequence;
 v_uid=v_hospital_uid||'-DOC-'||lpad(v_sequence::text,greatest(4,length(v_sequence::text)),'0');
 INSERT INTO public.doctors(id,uid,first_name,last_name,specialization,email,primary_hospital_id,
   sub_specialties,qualifications,expertise,languages,is_private_practice,updated_at)
 VALUES(p_doctor,v_uid,p_first,p_last,p_specialization,p_email,CASE WHEN p_primary THEN p_hospital ELSE NULL END,
   '{}','{}','{}','{}',false,clock_timestamp());
 INSERT INTO public.doctor_hospital_memberships(id,doctor_id,hospital_id,is_primary) VALUES(p_membership,p_doctor,p_hospital,p_primary);
 INSERT INTO public.doctor_activation_credentials(id,doctor_id,issued_by_user_id,token_digest,expires_at)
 VALUES(p_credential,p_doctor,p_actor,p_digest,p_expires);
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,doctor_id,hospital_id,details)
 VALUES(p_audit,p_actor,'doctor_provisioned',p_doctor,p_hospital,jsonb_build_object('activationCredentialId',p_credential,'isPrimary',p_primary));
 RETURN QUERY SELECT p_doctor,v_uid,p_hospital;
END $$;

CREATE FUNCTION public.mediid_add_doctor_membership(p_actor uuid,p_hospital uuid,p_doctor uuid,p_membership uuid,p_audit uuid,p_primary boolean)
RETURNS TABLE(id uuid,doctor_id uuid,hospital_id uuid,is_primary boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.mediid_provisioning_hospital(p_actor,p_hospital);
 IF p_primary IS NULL THEN RAISE EXCEPTION 'AUTH_INPUT' USING ERRCODE='P0001'; END IF;
 PERFORM 1 FROM public.doctors d LEFT JOIN public.users u ON u.id=d.user_id
 WHERE d.id=p_doctor AND d.is_active AND (d.user_id IS NULL OR (u.is_active AND u.role='doctor')) FOR UPDATE OF d;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 IF EXISTS(SELECT 1 FROM public.doctor_hospital_memberships m WHERE m.doctor_id=p_doctor AND (m.hospital_id=p_hospital OR (p_primary AND m.is_primary)))
 THEN RAISE EXCEPTION 'AUTH_CONFLICT' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.doctor_hospital_memberships(id,doctor_id,hospital_id,is_primary) VALUES(p_membership,p_doctor,p_hospital,p_primary);
 IF p_primary THEN UPDATE public.doctors SET primary_hospital_id=p_hospital,updated_at=clock_timestamp() WHERE doctors.id=p_doctor; END IF;
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,doctor_id,hospital_id,details)
 VALUES(p_audit,p_actor,'membership_added',p_doctor,p_hospital,jsonb_build_object('membershipId',p_membership,'isPrimary',p_primary));
 RETURN QUERY SELECT p_membership,p_doctor,p_hospital,p_primary;
END $$;

CREATE FUNCTION public.mediid_remove_doctor_membership(p_actor uuid,p_membership uuid,p_audit uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_doctor uuid; v_hospital uuid;
BEGIN
 SELECT doctor_id,hospital_id INTO v_doctor,v_hospital FROM public.doctor_hospital_memberships WHERE id=p_membership;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 PERFORM public.mediid_provisioning_hospital(p_actor,v_hospital);
 PERFORM 1 FROM public.doctors WHERE id=v_doctor FOR UPDATE;
 DELETE FROM public.doctor_hospital_memberships WHERE id=p_membership AND doctor_id=v_doctor AND hospital_id=v_hospital;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_CONFLICT' USING ERRCODE='P0001'; END IF;
 UPDATE public.doctors SET primary_hospital_id=NULL,updated_at=clock_timestamp() WHERE id=v_doctor AND primary_hospital_id=v_hospital;
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,doctor_id,hospital_id,details)
 VALUES(p_audit,p_actor,'membership_removed',v_doctor,v_hospital,jsonb_build_object('membershipId',p_membership));
 RETURN true;
END $$;

CREATE FUNCTION public.mediid_activate_doctor(p_uid text,p_digest text,p_hash text,p_user uuid,p_audit uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_credential public.doctor_activation_credentials%ROWTYPE; v_doctor public.doctors%ROWTYPE; v_hospital uuid;
BEGIN
 IF p_uid IS NULL OR p_uid<>upper(btrim(p_uid)) OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$'
 OR p_hash IS NULL OR p_hash !~ '^\$2[aby]\$(12|13|14)\$[./A-Za-z0-9]{53}$'
 THEN RAISE EXCEPTION 'AUTH_CREDENTIALS' USING ERRCODE='P0001'; END IF;
 SELECT c.* INTO v_credential FROM public.doctor_activation_credentials c JOIN public.doctors d ON d.id=c.doctor_id
 WHERE c.token_digest=p_digest AND d.uid=p_uid AND c.consumed_at IS NULL AND c.expires_at>clock_timestamp() FOR UPDATE OF c;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_CREDENTIALS' USING ERRCODE='P0001'; END IF;
 SELECT id INTO v_hospital FROM public.hospitals WHERE user_id=v_credential.issued_by_user_id AND is_active;
 IF v_hospital IS NULL THEN RAISE EXCEPTION 'AUTH_CREDENTIALS' USING ERRCODE='P0001'; END IF;
 -- A removed membership or deactivated issuer invalidates outstanding activation.
 BEGIN
  PERFORM public.mediid_provisioning_hospital(v_credential.issued_by_user_id,v_hospital);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN RAISE EXCEPTION 'AUTH_CREDENTIALS' USING ERRCODE='P0001'; END;
 SELECT * INTO v_doctor FROM public.doctors WHERE id=v_credential.doctor_id AND is_active AND user_id IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.doctor_hospital_memberships WHERE doctor_id=v_credential.doctor_id AND hospital_id=v_hospital)
 OR v_credential.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'AUTH_CREDENTIALS' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.users(id,email,uid,password_hash,role,updated_at) VALUES(p_user,v_doctor.email,v_doctor.uid,p_hash,'doctor',clock_timestamp());
 UPDATE public.doctors SET user_id=p_user,updated_at=clock_timestamp() WHERE id=v_doctor.id;
 INSERT INTO public.auth_profiles(user_id,profile_kind,public_uid,safe_profile)
 VALUES(p_user,'doctor',v_doctor.uid,jsonb_build_object('id',v_doctor.id,'_id',v_doctor.id,'uid',v_doctor.uid,
   'firstName',v_doctor.first_name,'lastName',v_doctor.last_name,'specialization',v_doctor.specialization));
 UPDATE public.doctor_activation_credentials SET consumed_at=clock_timestamp() WHERE id=v_credential.id;
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,doctor_id,hospital_id,details)
 VALUES(p_audit,v_credential.issued_by_user_id,'doctor_activated',v_doctor.id,v_hospital,jsonb_build_object('userId',p_user,'activationCredentialId',v_credential.id));
 RETURN true;
END $$;

-- Identity foundation only. Front desk keeps its own scoped role, never admin.
CREATE FUNCTION public.mediid_link_hospital_staff(p_actor uuid,p_hospital uuid,p_staff uuid,p_user uuid,p_audit uuid)
RETURNS TABLE(id uuid,user_id uuid,hospital_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.mediid_provisioning_hospital(p_actor,p_hospital);
 PERFORM 1 FROM public.users WHERE users.id=p_user AND is_active AND role='hospital_staff' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 UPDATE public.hospital_memberships s SET user_id=p_user WHERE s.id=p_staff AND s.hospital_id=p_hospital AND s.is_active AND s.user_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,hospital_id,staff_id,details)
 VALUES(p_audit,p_actor,'staff_identity_linked',p_hospital,p_staff,jsonb_build_object('userId',p_user));
 RETURN QUERY SELECT p_staff,p_user,p_hospital;
END $$;

REVOKE ALL ON public.doctor_activation_credentials,public.auth_provisioning_audit FROM PUBLIC,mediid_runtime,mediid_diagnostics;
REVOKE ALL ON FUNCTION public.mediid_provisioning_hospital(uuid,uuid) FROM PUBLIC,mediid_runtime,mediid_diagnostics;
REVOKE ALL ON FUNCTION public.mediid_provision_doctor(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,boolean,text,timestamptz) FROM PUBLIC,mediid_diagnostics;
REVOKE ALL ON FUNCTION public.mediid_add_doctor_membership(uuid,uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,mediid_diagnostics;
REVOKE ALL ON FUNCTION public.mediid_remove_doctor_membership(uuid,uuid,uuid) FROM PUBLIC,mediid_diagnostics;
REVOKE ALL ON FUNCTION public.mediid_activate_doctor(text,text,text,uuid,uuid) FROM PUBLIC,mediid_diagnostics;
REVOKE ALL ON FUNCTION public.mediid_link_hospital_staff(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,mediid_diagnostics;
GRANT EXECUTE ON FUNCTION public.mediid_provision_doctor(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,boolean,text,timestamptz),
 public.mediid_add_doctor_membership(uuid,uuid,uuid,uuid,uuid,boolean),public.mediid_remove_doctor_membership(uuid,uuid,uuid),
 public.mediid_activate_doctor(text,text,text,uuid,uuid),public.mediid_link_hospital_staff(uuid,uuid,uuid,uuid,uuid) TO mediid_runtime;
COMMIT;
