# MEDIID development status

Single active repository: Mediid-main. Reviewed main baseline: b5822ae4201ae70f11d26386a69550c0bbbc7812 (merged PR #3).
Workflow: user-authorized direct-to-main; one complete tested Phase 2.2A commit, no intermediate pushes.

## Phase 1.3.1

COMPLETE. Exact native gate closed on PostgreSQL 18.4 with vector 0.8.2 and btree_gist 1.8. Three historical migrations executed unchanged. All four merged migrations and constraints.sql remain unchanged.

## Phase 2.1

MERGED / COMPLETE. Central Prisma lifecycle, validated connections/pools/timeouts/retries, separate migration/runtime/diagnostic credentials, readiness checks and isolated diagnostics retained. No operational database cutover.

## Phase 2.2A

IMPLEMENTED / TESTED / PENDING EXTERNAL REVIEW.

- Separate TypeScript auth services/repository/crypto/tokens/DTOs/policies and an explicitly guarded test-only HTTP harness. Existing Express auth routes, middleware, Mongo models, AuthContext, public MEDIID IDs and QR behavior unchanged; MongoDB remains operationally primary. No dual writes or user import.
- Configured bcrypt cost 12 (allowed 12-14), legacy verification without rehash, generic login failures with dummy comparison, separate RSA PEM settings, RS256 allowlist, explicit issuer/audience/subject/role/iat/nbf/expiry and a single active signing key.
- Forward migration 202610200003_phase22a_auth_identity canonicalizes unambiguous email/UID aliases, enforces canonical/unique identities and hashed expiring reset credentials, and grants only auth fields/ownership/membership columns. Conflicts, unsupported legacy representations and outstanding legacy reset state fail atomically for explicit reconciliation. No historical migration edited.
- Patient-only identity registration cannot create privileged users or issue public UIDs. UUIDv5 namespace/mapping frozen; new internal identities use the existing UUIDv7 helper. Ownership/membership policies fail closed; primary hospital alone grants no membership; private clinic authority remains with its doctor. Support has no implied EHR access.
- Reset delivery is an explicit, unmounted port; only SHA-256 digests persist. Expired/reused resets fail; existing JWT revocation is deferred. Legacy OTP code remains unchanged and its risks are documented.

Executed with synthetic disposable databases:

| Check | Actual result |
| --- | --- |
| Prisma 6.19.3 validate/generate; TypeScript check/build | PASS |
| Auth unit tests | 17 PASS |
| Native PostgreSQL auth/integration/runtime permissions; all five migrations via non-superuser Prisma | 39 PASS |
| Phase 2.1 infrastructure / identifier-config regressions | 24 + 10 PASS |
| Phase 1.3.1 PGlite schema/review | 27 + 70 PASS (not multi-session) |
| Exact native Phase 1.3.1 schema/review / independent-connection races | 27 + 70 / 4 PASS |
| MongoDB 7.0.30/Express regressions | 20 runner passes: 14 HTTP/profile/activation/reset, 5 startup/listener, container |
| React production build; frontend/server/routes/models unchanged | PASS; existing Browserslist/fs.F_OK warnings |

Fresh backend npm audit: 26 findings (2 critical, 18 high, 5 moderate, 1 low). Critical dependency chains include express > proxy-addr and @google-cloud/vision > google-gax > protobufjs. No current advisory for installed bcrypt/JWT packages; no safety or exploitability claim, no major upgrades. Frontend audit was not rerun; prior Phase 2.1 findings remain historical. Details and fresh setup: backend/prisma/AUTH_FOUNDATION.md and DEVELOPMENT.md.

Limits: no required local test skipped. Production TLS chains, managed poolers/load/deployment, real mail/secret-manager integration and production data were not tested or used. All disposable clusters stopped. No private keys, credentials, binaries, test databases, generated clients/builds or new audit dumps committed. Mounted legacy JWT fallback, inactive-account handling, activation proof, reset OTP/logging and response exposure remain explicit later hardening concerns.

## Phase 2.2B

NOT STARTED. Distributed throttling, Redis abuse controls, rotation/revocation/refresh sessions, provisioning workflows, final Mongo-to-PostgreSQL auth/profile/QR cutover, OAuth, MFA and secret-manager integration remain deferred. Stop for external review after the single commit/push to main.
