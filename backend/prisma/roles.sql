-- Run only as the administrator of the intended fresh development database.
-- No credentials: roles start NOLOGIN; supply passwords through secret management or psql \password.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mediid_migrator') THEN
  CREATE ROLE mediid_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mediid_runtime') THEN
  CREATE ROLE mediid_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mediid_diagnostics') THEN
  CREATE ROLE mediid_diagnostics NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('mediid_migrator','mediid_runtime','mediid_diagnostics') AND
   (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)) THEN RAISE EXCEPTION 'Unexpected privileged infrastructure role'; END IF;
END $$;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO mediid_migrator;
GRANT USAGE ON SCHEMA public TO mediid_runtime,mediid_diagnostics;
DO $$ BEGIN
 EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC',current_database());
 EXECUTE format('GRANT CONNECT,CREATE ON DATABASE %I TO mediid_migrator',current_database());
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO mediid_runtime,mediid_diagnostics',current_database());
END $$;
ALTER ROLE mediid_diagnostics SET default_transaction_read_only=on;
ALTER DEFAULT PRIVILEGES FOR ROLE mediid_migrator IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE mediid_migrator IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
