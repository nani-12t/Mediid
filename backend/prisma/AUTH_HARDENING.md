# Phase 2.2B authentication hardening

Phase 2.2B is implemented for local verification. MongoDB remains the business database. PostgreSQL authentication is an explicit opt-in; this change does not migrate clinical, scheduling, billing or marketplace services and is not a production cutover.

## Runtime setup

Set AUTH_BACKEND explicitly to legacy or postgres. Missing/unknown values fail startup. Both modes require the matching RSA private/public PEM pair, key ID, issuer, audience, 60-900 second access lifetime, bcrypt cost 12-14 and reset lifetime 300-1800 seconds from backend/.env.auth.example. That example file is not automatically loaded. Supply settings through backend/.env or environment/secret storage. There is no JWT_SECRET, HS256 or development-secret fallback. Switching from historical tokens requires signing in again.

Postgres mode additionally requires PG_RUNTIME_URL, AUTH_REDIS_URL, AUTH_RATE_KEY_SECRET (at least 32 bytes), exact AUTH_ALLOWED_ORIGINS, and SMTP_HOST/PORT/USER/PASS/FROM. PostgreSQL and Redis URLs require verified TLS in production. SMTP uses authenticated TLS on port 465 or STARTTLS on 587; there is no console delivery fallback. Startup checks database migration history, role safety and Redis availability. Runtime failures return fixed credential-free errors, with no Mongo authentication fallback.

Provision a fresh synthetic database as described in DEVELOPMENT.md: install vector and btree_gist, apply roles.sql, assign separate credentials, and deploy all seven migrations with mediid_migrator. The original five migrations remain unchanged. New migrations are 202610240001_phase22b_sessions and 202610240002_phase22b_provisioning. The app receives only mediid_runtime credentials, never migrator credentials. Diagnostics cannot read identities, sessions or activation/audit data.

## Sessions and browser behavior

Postgres registration is patient-only and creates a minimal patient identity/profile with a new public MID and QR payload. Privileged public registration is rejected. Login accepts canonical email or existing UID. Responses retain {token,user,profile}; mapped users retain Mongo user/profile identifiers in compatibility fields and expose the PostgreSQL identityId separately. Safe profiles contain an allowlist of identity fields rather than clinical records.

Access JWTs carry internal subject/role plus family ID, unique token ID and account version. Each authenticated request checks current PostgreSQL active state, role, account version and an unexpired nonrevoked family. Refresh credentials are 256-bit random values, stored only as SHA-256 digests. Rotation consumes the old credential once and preserves absolute family expiry (default seven days, configurable 900-2592000 seconds). Reuse revokes the entire family. Logout revokes its family. Password reset atomically consumes its credential, changes the hash/version and revokes every session. Password, role, active-state, email and UID changes invalidate old sessions through the database version trigger.

Refresh credentials travel only in HttpOnly cookies scoped to /api/auth. Production sets Secure. SameSite defaults to lax; production cross-site deployments require none and HTTPS. Every auth mutation requires both an exact allowed Origin and a matching random CSRF cookie/header. Auth requests are bounded to 16 KB. Responses use no-store. Redis enforces atomic per-source and per-identity windows for login, register, reset request/completion, refresh, activation and provisioning. Keys contain HMACs rather than raw addresses/identities. Limits return 429 with Retry-After; Redis failures return 503. The source dimension uses the direct socket peer; proxy deployments need a separately reviewed trusted-proxy design and tuned limits.

The frontend discovers the configured mode. Postgres primary access tokens remain in memory; refresh restores the session. Web Locks serialize same-origin tab rotations and BroadcastChannel shares short-lived access tokens/logout events. Without Web Locks, a cross-tab race can trigger the server's replay protection and require login. Legacy mode preserves its existing local-storage behavior. Secondary hospital doctor sessions do not replace the admin refresh cookie; session-only logout revokes the doctor's family. Their existing sessionStorage access-token compatibility remains and tokens expire after the short access lifetime.

Key rotation signs with the active key only. AUTH_JWT_PREVIOUS_PUBLIC_KEYS accepts at most five explicitly approved retiring RSA public keys keyed by distinct kid. Deploy the new active key plus old public key to every instance, retain the old verification key through the maximum old access lifetime, then remove it. Unknown IDs, remote key headers, private material in the retiring-key map and weak/mismatched keys are rejected. Refresh can issue access tokens under the new active key.

## Provisioning and authorization boundary

Authenticated hospital admins may POST /api/auth/provision/doctors with hospitalId, optional email, firstName, lastName, specialization and optional isPrimary. PostgreSQL rechecks the current active actor, role, hospital ownership and active state. Hospital sequence allocation, hierarchical UID, membership, digest-only activation credential and audit entry commit atomically. Only the authorized issuer receives the one-time activation.secret; deliver it securely and never log the response. Activation requires uid, password and activationToken, not UID alone. Expired/consumed credentials, inactive issuers and removed memberships fail closed.

POST /api/auth/provision/memberships and DELETE /api/auth/provision/memberships/:id mutate explicit doctor/hospital membership with attributed audit records. Multiple hospitals are supported; at most one primary is allowed. Primary-hospital metadata alone grants no authority. POST /api/auth/provision/staff-links binds an existing active hospital_staff identity to an existing active same-hospital staff record. There is no public staff-account creation flow, clinic receptionist role or implied support access.

Provisioning runs through parameterized, search-path-pinned SECURITY DEFINER functions. Runtime cannot directly mutate memberships, read activation digests, forge audit entries, mint privileged users, alter schema/history or access clinical tables. The authenticated server principal is the actor boundary; database credentials are trusted backend credentials.

Postgres sessions can reach only reconciled GET /api/patients/profile, GET /api/patients/qr and GET /api/hospitals/admin/profile business handlers, with authoritative PostgreSQL ownership checks. Other still-Mongo protected routes return AUTH_DOMAIN_NOT_MIGRATED (503). New PostgreSQL-only patients can authenticate but cannot use the unmigrated business handlers. Public business endpoints remain Mongo-backed. PostgreSQL Socket.IO integration is disabled pending domain authorization. Existing legacy authentication/provisioning/reset weaknesses remain in explicit legacy mode; this work does not certify that mode as hardened.

## Manual identity reconciliation

The operator-only auth:migrate CLI never runs at boot and does not load the application's .env. It requires explicit NODE_ENV=test|development, AUTH_MIGRATION_MONGO_URI and PG_MIGRATION_URL naming mediid_migrator. Only use an authorized synthetic/nonproduction source. It projects identity/ownership fields and never copies clinical records.

From backend, with those variables supplied:

    npm run auth:migrate -- dry-run
    npm run auth:migrate -- validate
    npm run auth:migrate -- apply --confirm-apply

Dry-run/validate do not write. Apply checkpoints each complete user/profile/link transaction and can resume after interruption. UUIDv5 uses the frozen namespace 57c0c744-9cdc-41f9-a532-7e60be63d87f; original public UID/QR bytes, bcrypt hashes, active state, roles and available source times are preserved. Missing source times, unsupported identifiers, unresolved ownership, outstanding legacy reset state, duplicates and target/source drift require reconciliation; the tool never merges identities or overwrites changed credentials. Hospital doctor/staff sequence counters are preserved; missing/invalid counters require reconciliation. Imported memberships use their import timestamp and audit joinedAtBasis=import_time; doctor creation time is never presented as a historical joining time. No production migration or automatic dual writes are included.

## Verification

Run npm run prisma:validate, npm run prisma:generate, npm run check:js, npm run test:auth:unit, npm run test:auth, npm run test:auth:sessions, npm run test:auth:provisioning, npm run test:auth:redis, npm run test:auth:migration and npm run test:auth:http from backend. Run npm test -- --watchAll=false --runInBand and npm run build from frontend. Database/Redis/HTTP suites use disposable synthetic services and ignored .test-data artifacts. Native independent connections exercise race behavior; PGlite is not evidence of multi-session correctness.

Final executed results are recorded in DEVELOPMENT_STATUS.md. Production TLS, real SMTP delivery, deployment, load, OAuth/MFA, full business migration and dependency-vulnerability remediation remain outside this local verification.
