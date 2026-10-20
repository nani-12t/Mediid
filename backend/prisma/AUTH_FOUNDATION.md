# Phase 2.2A authentication foundation

## Legacy compatibility review (before implementation)

The mounted backend/routes/auth.js and middleware/auth.js use Mongo ObjectId claims named id, symmetric JWT signing with a development fallback and a seven-day default lifetime. User hashes use bcrypt cost 12. User email is trimmed/lowercased by Mongoose, while UID case handling differs between login and doctor activation. These paths remain mounted and unchanged in this phase.

Frontend AuthContext stores mediid_token and consumes {token,user,profile}; /api/auth/me restores its state. Patient and hospital public IDs/QR codes live on profile documents. Activated doctors can also log in with a hierarchical UID on User. Hospital admins own Hospital.user; doctors have an optional linked user and historically mandatory hospital; independent PostgreSQL doctors may have no primary hospital. Internal UUIDs are not public MEDIID UIDs.

Existing concerns to carry forward: registration accepts privileged profile roles; doctor self-registration assigns a placeholder hospital; doctor activation has no proof-of-ownership challenge; legacy login does not enforce isActive; unknown/wrong-password messages differ; role-only middleware does not establish resource ownership. Routes log identity information and some raw errors; /me serializes a broad User object excluding only password. Password reset uses Math.random six-digit plaintext OTP storage and development OTP logging. No account import, fallback removal, response change, QR change or reset replacement is authorized here. These are explicit later integration/hardening review items, not security claims about the mounted application.

## Isolated boundary

New TypeScript auth services use Phase 2.1's Prisma lifecycle, one forward identity/permission migration, configured bcrypt and RS256. Only a guarded test harness exercises them; no production router mounts them. Registration creates only a patient identity, without creating a clinical profile or issuing/claiming a public UID. Privileged identities and memberships are synthetic administrator fixtures in tests; provisioning is deferred.

## Implemented modules and lifecycle

src/auth separates configuration, crypto, tokens, repository access, services, DTOs, errors, authorization policies and a testing harness. There are no imports from these modules in server.js or existing routes. The Node HTTP harness is equivalent test-only integration, requires NODE_ENV=test when explicitly created, binds loopback in tests and is never mounted automatically. It has a bounded body and no-store responses, not a production abuse-control boundary.

Compose one IdentityRepository, PasswordHasher, AccessTokens, Authentication and AuthorizationPolicies per process around the already-started Phase 2.1 PostgresInfrastructure. Reuse its client; stop its owner during process shutdown. Module imports do not connect, read MongoDB users or create Prisma clients per request. Service callers must map exceptions through authResponse and must pass only verified principals returned by authenticate into policies, never principals from request bodies.

Registration accepts only email/password and fixes role=patient. It creates an identity with UUIDv7 and uid=null; it does not allocate public IDs, create profiles, grant memberships or implement privileged account provisioning. Login accepts canonical email or an existing canonical UID. authenticate reloads current active state and role. DTOs allow only id/email/uid/role. Internal UUIDv5/v7 IDs remain distinct from public MID-/HID-/doctor IDs; no Mongo accounts are imported, rewritten or rehashed.

## Passwords, RSA keys and reset credentials

New hashes use the explicit AUTH_BCRYPT_COST (12-14; reviewed/tested value 12). New passwords require at least 12 characters, at most 72 UTF-8 bytes and no NUL. Existing bcrypt hashes remain verifiable at their stored work factor, including legacy shorter passwords; no automatic rehash occurs. A future opt-in rehash-on-login needs its own review and migration/rollback strategy. Unknown/malformed identity, inactive account and incorrect-password paths perform one bcrypt comparison and return the same 401 body; unknown/invalid stored hashes use a process-initialized dummy. This is constant response behavior, not a claim of identical wall-clock timing for legacy hashes of different cost.

.env.auth.example contains placeholders only. authConfig reads explicitly supplied environment values; it does not load a local auth file, reuse JWT_SECRET or generate keys automatically. Supply AUTH_JWT_PRIVATE_KEY and AUTH_JWT_PUBLIC_KEY separately as PEM strings (multiline or escaped newlines), with a matching RSA pair of at least 2048 bits. Supply AUTH_JWT_KEY_ID, AUTH_JWT_ISSUER, AUTH_JWT_AUDIENCE, AUTH_JWT_TTL_SECONDS (60-900), AUTH_BCRYPT_COST and AUTH_RESET_TTL_SECONDS (300-1800). Missing/weak/mismatched keys fail closed. Private keys must remain outside Git and logs; the optional local auth filename is ignored. Tests generate disposable keys in memory and never write key files.

AccessTokens explicitly signs/verifies RS256 only and checks issuer, audience, internal UUID subject, supported role, iat, nbf and bounded expiration. Unknown key IDs and remote-key/unsupported headers are rejected. The SigningKeys interface permits a later reviewed provider; this phase supports exactly one active signing key. JWT contents include no public UID, email, profile, password or reset metadata. authResponse maps failures to fixed safe codes/messages; new modules do not log inputs, tokens or exceptions.

ResetDelivery is an explicit adapter port with no mounted email adapter. Requests return generic metadata; only the adapter receives the one-time 256-bit secret. SHA-256 hex digests and expiry are stored, and a single conditional database UPDATE consumes an unexpired active-account reset once. Plaintext/partial reset state is rejected by SQL. Delivery failures are not exposed or logged with secrets; retry/operational delivery monitoring is deferred. Reset does not revoke already-issued tokens in this phase; token/session revocation remains Phase 2.2B. The legacy six-digit OTP implementation is unchanged and separately regression-tested.

## Identity migration and runtime permissions

Forward migration 202610200003_phase22a_auth_identity follows the four merged migrations unchanged. It locks users, fails atomically on normalized email/UID conflicts, unsupported/incomplete legacy representations or outstanding legacy reset credentials, then normalizes unambiguous aliases. Email is trimmed/lowercased without provider-specific rewrites; UID outer spaces/case are canonicalized to uppercase while preserving every ID component. No IDs are generated or identities merged. Unsupported legacy values require explicit reconciliation rather than guessing. New service inputs use ASCII email addresses with outer whitespace trimming; direct SQL must supply canonical values. Database checks plus normalized unique indexes cover INSERT and UPDATE paths. Reset storage widens to 64 characters for SHA-256, with digest/expiry pairing and unique non-null digests.

Run the Phase 2.1 fresh-database role/extension setup first and deploy all five migrations with the migration credential. Existing PostgreSQL data needs reconciliation review, not automatic import or production migration. Runtime grants are limited to:

| Table | Access |
| --- | --- |
| users | SELECT authentication fields; INSERT id/email/password_hash/role/updated_at; UPDATE last_login_at/updated_at/password_hash/reset digest/expiry |
| patients | SELECT id/user_id only |
| doctors | SELECT id/user_id/is_active/is_private_practice only |
| hospitals | SELECT id/user_id/is_active only |
| doctor_hospital_memberships | SELECT id/doctor_id/hospital_id only (Prisma includes its primary key) |

Parameterized registration SQL leaves active/created defaults to PostgreSQL. Runtime cannot update roles, active state, public UIDs, profiles or memberships, delete users, read clinical fields/tables, change schema/history or become migrator. The service always fixes new registration to patient; direct database credentials are a trusted backend boundary, not a public API. Diagnostics retains infrastructure metadata access only and cannot read identity hashes. No clinical/appointment/financial permissions were added.

Policies verify active actors/current roles, patient self ownership, doctor identity, hospital-admin ownership, explicit doctor-hospital membership, hospital scope and private-practice doctor ownership. primaryHospitalId does not grant membership authority. Multiple memberships and independent private doctors remain valid. Hospital context is not blanket EHR authorization. There is no clinic receptionist role. The current UserRole schema has no front-desk identity link/provisioning; unprovisioned principals fail closed rather than receiving invented authority. Support principals receive no implied EHR or hospital access; any later assistance operation must carry actor, hospital scope and explicit permission/audit context.

## Executed verification and remaining work

Prisma validate/generate and TypeScript checks pass. Auth unit tests: 17 PASS. Native PostgreSQL 18.4 / vector 0.8.2 / btree_gist 1.8: all five migrations deploy with non-superuser migrator credentials; auth/permission/normalization/reset checks: 39 PASS. Phase 2.1 infrastructure: 24 PASS and 10 unit PASS. Phase 1.3.1: 27 + 70 PGlite checks and 27 + 70 exact native checks PASS; independent-connection races: 4 PASS. PGlite is not multi-session testing. MongoDB 7.0.30/Express: 20 runner passes (14 HTTP/profile/activation/reset checks, 5 startup/listener checks and the container test). React production build PASS; old Browserslist data and fs.F_OK warnings remain. Raw new auth/audit results stay in ignored .test-data; this document and DEVELOPMENT_STATUS.md record the concise results.

Fresh backend npm audit: 26 findings (2 critical, 18 high, 5 moderate, 1 low). Critical paths include express > proxy-addr and @google-cloud/vision > google-gax > protobufjs. Direct affected packages: mongoose/uuid (moderate), nodemailer/nodemon/prisma (high). No current advisory is reported for installed bcryptjs 2.4.3, jsonwebtoken 9.0.3, jws 4.0.1 or jwa 2.0.1; this does not establish safety or exploitability. Only pinned development type packages were added; no major upgrades. Historical Phase 2.1 advisory/path detail remains under security/audits/phase21. Frontend audit was not rerun in this phase; its prior findings are historical, not a fresh count.

No required disposable-database verification was skipped. Production TLS chains/load/deployment, real mail/secret-manager integration and production data were not tested or used. Deferred Phase 2.2B: distributed throttling/Redis abuse controls, rotation, revocation/sessions/refresh families, membership provisioning, final authentication/profile/QR cutover, production OAuth, MFA and secret-manager integration. Known mounted legacy weaknesses listed above remain unresolved and must be addressed before an approved cutover.

References: [jsonwebtoken algorithm and claim options](https://github.com/auth0/node-jsonwebtoken/blob/master/README.md), [bcrypt input-length considerations](https://github.com/dcodeIO/bcrypt.js/).
