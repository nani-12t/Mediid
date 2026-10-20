-- Phase 2.2A: isolated authentication identity, not an operational cutover.
BEGIN;
LOCK TABLE public.users IN ACCESS EXCLUSIVE MODE;
-- Fail before changing identities; a human must reconcile aliases/conflicts.
DO $$ BEGIN
 IF EXISTS (SELECT lower(btrim(email)) FROM public.users WHERE email IS NOT NULL GROUP BY lower(btrim(email)) HAVING count(*) > 1)
 OR EXISTS (SELECT upper(btrim(uid)) FROM public.users WHERE uid IS NOT NULL GROUP BY upper(btrim(uid)) HAVING count(*) > 1) THEN
  RAISE EXCEPTION 'Identity canonicalization conflicts require explicit reconciliation';
 END IF;
 IF EXISTS (SELECT 1 FROM public.users WHERE
   (email IS NOT NULL AND (btrim(email) = '' OR btrim(email) !~ '^[!-~]+$' OR position('@' IN email) < 2)) OR
   (uid IS NOT NULL AND upper(btrim(uid)) !~ '^[A-Z0-9]+(-[A-Z0-9]+)+$')) THEN
  RAISE EXCEPTION 'Incomplete or unsupported legacy identities require explicit reconciliation';
 END IF;
 IF EXISTS (SELECT 1 FROM public.users WHERE reset_password_token IS NOT NULL OR reset_password_expires_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Outstanding legacy reset credentials require explicit reconciliation';
 END IF;
END $$;
UPDATE public.users SET email = lower(btrim(email)), uid = upper(btrim(uid));
ALTER TABLE public.users ALTER COLUMN reset_password_token TYPE varchar(64);
ALTER TABLE public.users ADD CONSTRAINT users_email_canonical CHECK
 (email IS NULL OR (email = lower(btrim(email)) AND email ~ '^[!-~]+$' AND position('@' IN email) > 1));
ALTER TABLE public.users ADD CONSTRAINT users_uid_canonical CHECK
 (uid IS NULL OR (uid = upper(btrim(uid)) AND uid ~ '^[A-Z0-9]+(-[A-Z0-9]+)+$'));
CREATE UNIQUE INDEX users_email_canonical_unique ON public.users (lower(btrim(email))) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_uid_canonical_unique ON public.users (upper(btrim(uid))) WHERE uid IS NOT NULL;
ALTER TABLE public.users ADD CONSTRAINT users_reset_digest_pair CHECK
 ((reset_password_token IS NULL AND reset_password_expires_at IS NULL) OR
  (reset_password_token IS NOT NULL AND reset_password_token ~ '^[0-9a-f]{64}$' AND reset_password_expires_at IS NOT NULL));
CREATE UNIQUE INDEX users_reset_digest_unique ON public.users (reset_password_token) WHERE reset_password_token IS NOT NULL;
-- Column grants avoid unrelated profile fields and all clinical/business records.
GRANT SELECT (id,email,uid,password_hash,role,is_active,last_login_at,reset_password_token,reset_password_expires_at)
 ON public.users TO mediid_runtime;
GRANT INSERT (id,email,password_hash,role,updated_at) ON public.users TO mediid_runtime;
GRANT UPDATE (last_login_at,updated_at,password_hash,reset_password_token,reset_password_expires_at)
 ON public.users TO mediid_runtime;
GRANT SELECT (id,user_id) ON public.patients TO mediid_runtime;
GRANT SELECT (id,user_id,is_active,is_private_practice) ON public.doctors TO mediid_runtime;
GRANT SELECT (id,user_id,is_active) ON public.hospitals TO mediid_runtime;
GRANT SELECT (id,doctor_id,hospital_id) ON public.doctor_hospital_memberships TO mediid_runtime;
COMMIT;
