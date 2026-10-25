-- Phase 2.2B: refresh credential families, safe compatibility metadata, immediate account invalidation.
BEGIN;
ALTER TABLE public.users ADD COLUMN auth_version integer NOT NULL DEFAULT 0 CHECK (auth_version >= 0);
CREATE TABLE public.auth_sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 family_id uuid NOT NULL, refresh_digest varchar(64) NOT NULL UNIQUE CHECK(refresh_digest ~ '^[0-9a-f]{64}$'),
 issued_at timestamptz(6) NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz(6) NOT NULL,
 last_used_at timestamptz(6), consumed_at timestamptz(6), replacement_id uuid REFERENCES public.auth_sessions(id),
 revoked_at timestamptz(6), revoke_reason text, auth_version integer NOT NULL CHECK(auth_version >= 0),
 CHECK(expires_at > issued_at), CHECK((revoked_at IS NULL) = (revoke_reason IS NULL))
);
CREATE INDEX auth_sessions_user_id_idx ON public.auth_sessions(user_id);
CREATE INDEX auth_sessions_family_id_idx ON public.auth_sessions(family_id);
CREATE UNIQUE INDEX auth_sessions_one_current_family ON public.auth_sessions(family_id) WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE TABLE public.auth_legacy_links (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 mongo_user_id varchar(24) NOT NULL UNIQUE CHECK(mongo_user_id ~ '^[0-9a-f]{24}$'),
 patient_mongo_id varchar(24), doctor_mongo_id varchar(24), hospital_mongo_id varchar(24),
 source_fingerprint varchar(64) NOT NULL CHECK(source_fingerprint ~ '^[0-9a-f]{64}$'),
 migrated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE TABLE public.auth_profiles (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 profile_kind text NOT NULL CHECK(profile_kind IN ('patient','hospital_admin','doctor','hospital_staff')),
 public_uid varchar(64), legacy_profile_id varchar(24), safe_profile jsonb NOT NULL
);
-- Runtime cannot mint privileged identities through its historical INSERT grant.
CREATE FUNCTION public.mediid_auth_user_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF current_user = 'mediid_runtime' AND NEW.role::text <> 'patient' THEN
   RAISE EXCEPTION 'AUTH_FORBIDDEN' USING ERRCODE='42501';
  END IF;
 ELSIF (NEW.password_hash,NEW.role,NEW.is_active,NEW.email,NEW.uid) IS DISTINCT FROM
       (OLD.password_hash,OLD.role,OLD.is_active,OLD.email,OLD.uid) THEN
  NEW.auth_version := OLD.auth_version + 1;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mediid_auth_user_guard() FROM PUBLIC;
CREATE TRIGGER auth_user_guard BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.mediid_auth_user_guard();
GRANT INSERT(uid) ON public.users TO mediid_runtime;
GRANT SELECT(auth_version) ON public.users TO mediid_runtime;
GRANT SELECT,INSERT,UPDATE ON public.auth_sessions TO mediid_runtime;
GRANT SELECT ON public.auth_legacy_links TO mediid_runtime;
GRANT SELECT,INSERT ON public.auth_profiles TO mediid_runtime;
-- Registration writes only minimal identity/ownership fields, not health records.
GRANT INSERT(id,user_id,uid,first_name,last_name,updated_at) ON public.patients TO mediid_runtime;
COMMIT;
