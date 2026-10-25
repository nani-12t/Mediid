# PostgreSQL infrastructure development

MongoDB remains the operational business database. Authentication is explicitly selected with AUTH_BACKEND=legacy|postgres; providers additionally require ORGANIZATION_BACKEND=legacy|postgres, with postgres requiring PostgreSQL authentication; there is no automatic cutover or fallback. PostgreSQL authentication reuses one bounded Prisma lifecycle and adds no business dual writes. See [AUTH_HARDENING.md](AUTH_HARDENING.md) for configuration, eight-migration setup, credentials, cookies and manual synthetic identity reconciliation. See ORGANIZATIONS.md for the Phase 2.3 provider repositories, API contracts and clinic ownership. Python/FastAPI remains reserved for the separate AI service.

## Fresh backend setup

Use a reviewed Node release compatible with Prisma 6.19.3; this branch was tested on Node 24.19.0. Run npm ci in backend, then npm run prisma:validate, npm run prisma:generate and npm run check:js. Schema validation/generation use an explicit nonconnecting validation URL and do not need real credentials. All backend application source is JavaScript/CommonJS. Infrastructure, auth services and tests load src directly; no TypeScript compiler, tsconfig or dist build is required. Python/FastAPI is reserved for the separate future AI service.

For an empty development PostgreSQL database, an administrator must install compatible pgvector and btree_gist first. Connect to that intended development database with psql and run prisma/roles.sql. It creates separate mediid_migrator, mediid_runtime and mediid_diagnostics roles, initially NOLOGIN with no passwords. Enable LOGIN and set distinct passwords using psql's interactive password command or your secret manager. Do not put passwords in SQL files, shell history, commits or logs. Existing populated databases require separate review/reconciliation; this setup is not a production cutover script.

The administrator preprovisions extensions because vector installation requires elevated database privileges. Migration credentials are deliberately not superuser credentials. Example administrator SQL, executed only against your selected new development database:

    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS btree_gist;
    -- Run roles.sql using psql -f prisma/roles.sql against the same database.
    ALTER ROLE mediid_migrator LOGIN;
    ALTER ROLE mediid_runtime LOGIN;
    ALTER ROLE mediid_diagnostics LOGIN;

Use psql interactive password prompts for all three roles. Copy .env.postgres.example to .env.postgres.local and edit percent-encoded connection credentials. CLI tools load this ignored local file without overriding environment variables. PG_ENV_FILE can select another file. Deployed application environments receive only PG_RUNTIME_URL; migration jobs receive only PG_MIGRATION_URL; read-only diagnostics receive PG_READONLY_URL. DATABASE_URL and MONGO_URI are never runtime/migration credential fallbacks.

From backend:

    npm run db:migrate:deploy
    npm run db:migrate:status
    npm run db:check
    npm run db:diagnostics

The migration wrapper accepts only the named migration role, captures raw Prisma CLI output, and prints a credential-free result. It does not provision extensions, invent migration history, or use runtime credentials for schema changes. Do not edit any applied migration. Deploy these files in order:

1. 202610190001_phase131_baseline
2. 202610190002_phase131_constraints
3. 202610200001_phase131_review
4. 202610200002_phase21_infrastructure_permissions
5. 202610200003_phase22a_auth_identity
6. 202610240001_phase22b_sessions
7. 202610240002_phase22b_provisioning
8. 202610250001_phase23_provider_hierarchy

The first five merged files are unchanged. The fourth grants infrastructure metadata access only; the fifth adds Phase 2.2A authentication/ownership reads. The sixth adds versioned sessions and minimal patient registration; the seventh adds audited, hospital-scoped provisioning through restricted functions. Runtime cannot create schema objects, mutate migration history or access clinical tables. Diagnostics retains metadata-only access. See AUTH_HARDENING.md for current grants, identity reconciliation and authentication settings.

## Lifecycle, readiness and pooling

Use postgresInfrastructure() from src/infrastructure/postgres/client.js for one owner per process. Importing it does not connect. server.js starts it explicitly through the authentication runtime only when AUTH_BACKEND=postgres. Explicit start() deduplicates concurrent initialization, validates role safety and checks migration history/checksums before client access is permitted. Missing, incomplete, unexpected or changed migrations block readiness. Only Git LF/CRLF checkout differences are tolerated; SQL-content drift is rejected. stop() is idempotent and prevents future use. Shutdown during initialization waits for cleanup.

PG_POOL_SIZE defaults to 4 in development, 2 in tests and 10 in production (range 1-50 per process). Size the total across worker processes against the server limit. PG_CONNECT_TIMEOUT_SECONDS defaults to 3, pool wait to 5 and query timeout to 10. Initial connection attempts default to 3 with 250ms delay; only temporary availability failures are retried. Authentication/configuration/migration/permission failures fail immediately. No business writes are retried. Strict production URLs require sslmode=require and sslaccept=strict, plus your trusted CA settings when needed. Prisma certificate paths are relative to its schema directory.

CLI check/readonly modes initialize, print safe readiness metadata, disconnect and exit. The JavaScript CLI watch mode keeps the owner alive until SIGINT/SIGTERM; automated Windows tests use the same shutdown handler through a controlled IPC message. Status/errors contain no credentials, connection URLs or sensitive records. PostgreSQL failure is explicit and does not redirect writes to MongoDB.

## Native disposable verification

Tests never use DATABASE_URL or your installed database services. They initialize a new SCRAM-authenticated cluster on a random loopback port, create synthetic databases/credentials, and stop the cluster afterward. Set MEDIID_TEST_PG_BIN to the native binary directory if it differs from the Windows PostgreSQL 18 default. Compiled extensions, cluster data, credentials and build logs stay under ignored .test-data; none are committed.

On Windows with PostgreSQL 18 server headers and Visual Studio C++ Build Tools, run scripts/build-test-pgvector.ps1 from PowerShell. The script downloads official pgvector v0.8.2, checks the pinned archive SHA256, compiles against the selected PostgreSQL headers and stages the DLL/control/SQL files only in .test-data. It never runs nmake install or modifies Program Files. PostgreSQL 18's extension_control_path enables these files only for each disposable cluster. MEDIID_TEST_EXTENSION_ROOT can select another staged extension root. On other systems, install compatible native extensions and set MEDIID_TEST_PG_BIN.

    npm run test:native:exact
    npm run test:review:native
    npm run test:infra
    npm run test:infra:unit
    npm run check:js
    npm run test:legacy

The exact gate executes all three original migration files unchanged, verifies both extensions and a real vector operator, then runs 27 schema and 70 review checks on native PostgreSQL. The concurrency suite now requires real pgvector and never removes SQL. The infrastructure suite uses Prisma to deploy all eight migrations with non-superuser migration credentials and tests real role permissions, pooling, missing/drifted migrations, connection/auth failures and client/process shutdown. Pure identifier/configuration tests are separate. Production TLS chains, managed poolers, production load and production deployment remain outside this local verification.

## Ownership and remaining security work

Public MEDIID UIDs are unchanged. Legacy ObjectId conversion uses the frozen UUIDv5 namespace 57c0c744-9cdc-41f9-a532-7e60be63d87f and rejects noncanonical input instead of silently remapping it. New PostgreSQL IDs use a separately pinned UUIDv7 library; the existing UUID dependency used by MongoDB routes is preserved.

Fresh dependency findings and affected paths are in ../../security/audits/phase21. They are unresolved; no forced major upgrades were performed. Phase 2.2B adds explicit-mode authentication hardening; see AUTH_HARDENING.md. Production cutover, production data migration and broader business-domain migration remain deferred.

References: [Prisma v6 PostgreSQL settings](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql), [PostgreSQL 18 extension paths](https://www.postgresql.org/docs/18/runtime-config-client.html), [official pgvector build instructions](https://github.com/pgvector/pgvector/tree/v0.8.2).
