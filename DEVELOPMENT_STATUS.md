# MEDIID development status

MEDIID Node/Express backend language: JavaScript/CommonJS.
Do not introduce TypeScript into the Node backend.
Python/FastAPI is reserved for the separate AI service.

Single active repository: Mediid-main. Phase 2.2B baseline: e856c99ce5f702199c4fffc0ce69f00bbfcd486c.
Workflow: direct-to-main; one tested phase commit, no intermediate pushes.

| Phase | Status |
| --- | --- |
| Phase 1.3.1 | COMPLETE |
| Phase 2.1 | COMPLETE |
| Phase 2.2A | COMPLETE |
| JavaScript Standardization | COMPLETE (externally reviewed) |
| Phase 2.2B | IMPLEMENTED / TESTED / PENDING EXTERNAL REVIEW |

## Phase 2.2B external review correction — 2026-10-25

Phase 2.2B — IMPLEMENTED / TESTED / PENDING EXTERNAL REVIEW

Correction starts from clean main/origin/main at 6b1ddc9886591e212465cc32299f351496807cb0. The Phase 2.2B implementation baseline is e856c99ce5f702199c4fffc0ce69f00bbfcd486c. JavaScript Standardization — COMPLETE; its external review already passed.

Added hospital_staff to Prisma UserRole to reflect the value already installed by 202610240002_phase22b_provisioning. Regenerated Prisma now recognizes the role, and the JavaScript allowlist derived from Object.values(UserRole) agrees. No migration was edited or added. No staff/scheduling business API or clinical authority was introduced.

New npm run test:auth:staff executes 11 native PostgreSQL/real Redis checks using disposable synthetic data and the actual restricted runtime credential. It covers generated enum/allowlist, normal identity repository reads, email and UID session login, RS256 issuance/verification and exact principal role, hospital-scoped staff linking, denied cross-hospital relinking, doctor provisioning/admin impersonation denial, no implied EHR policy/database access, and actual mounted business protection with and without a legacy mapping.

The mounted HTTP regression initially exposed a stale raw Mongo hospital fixture missing required sequence counters. Added doctorSequence=1 and staffSequence=0 to that synthetic fixture; reconciliation rules and application source were preserved.

### Fresh backend dependency audit

npm audit was executed against the current backend lockfile before and after targeted compatible fixes. Counts are vulnerable dependency entries, not counts of individual advisories:

| Severity | Before | After |
| --- | --- | --- |
| Critical | 2 | 1 |
| High | 16 | 14 |
| Moderate | 5 | 4 |
| Low | 0 | 0 |
| Total | 23 | 19 |

Updated Express from locked 4.22.1 to 4.22.3 and raised its manifest minimum to ^4.22.3. The targeted lockfile updates are body-parser 1.20.4 → 1.20.9, proxy-addr 2.0.7 → 2.0.8, path-to-regexp 0.1.12 → 0.1.13 and qs 6.14.2 → 6.16.1, with required qs children side-channel 1.1.0 → 1.1.1 and side-channel-list 1.0.0 → 1.0.1. No other packages changed. These resolve the reported [proxy-addr critical issue](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h), [body-parser compressed-request crash](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828), [path-to-regexp route issue](https://github.com/pillarjs/path-to-regexp/security/advisories/GHSA-37ch-88jc-xwx2) and [qs denial of service](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g). No audit fix --force or major upgrade was used.

Current direct authentication/security dependencies were reviewed: jsonwebtoken 9.0.3, bcryptjs 2.4.3 and ioredis 5.10.1 have no entries in this audit; @prisma/client 6.19.3 has no direct finding. Prisma CLI 6.19.3 remains high through @prisma/config/deepmerge-ts, Nodemailer 6.10.1 remains high, and uuid 9.0.1 remains moderate. The audit's proposed direct remedies require major upgrades (Prisma 7.10.1, Nodemailer 10.2.1, uuid 14.0.3), so they were deferred. The auth UUIDv5 call uses the frozen namespace without a caller-supplied output buffer; this does not remove the dependency finding.

Remaining critical exposure is protobufjs through Google Vision/google-gax. Remaining high findings include grpc-js, Prisma/config/deepmerge-ts, axios/form-data through Twilio, lodash through express-validator, Socket.IO/engine/parser/adapter/ws, development glob/picomatch dependencies and Nodemailer. Remaining moderate findings include the protobuf UTF-8 helper, follow-redirects, Mongoose and uuid. Compatible fixes outside the selected auth/Express path remain deferred; the backend is not vulnerability-free. Raw audit JSON is not committed.

### Correction verification

| Check rerun after correction | Result |
| --- | --- |
| Prisma validation / generation | PASS / PASS |
| Generated Prisma enum and JavaScript allowlist | hospital_staff recognized |
| JavaScript syntax | PASS |
| Auth unit / Phase 2.2A native auth | 31 / 39 PASS |
| Phase 2.2B native sessions / provisioning | 13 / 13 PASS |
| hospital_staff authentication boundary | 11 PASS |
| Real Redis distributed limits | 5 PASS |
| Migration/reconciliation | 16 PASS |
| Mounted auth HTTP | 15 PASS |
| PostgreSQL infrastructure / infrastructure unit | 24 / 10 PASS |
| Mongo/Express regressions | 20 PASS |
| Frontend auth tests | 16 PASS across 2 suites |
| Frontend production build | PASS; existing Browserslist/fs.F_OK warnings |

Only synthetic disposable services were used. All required correction checks passed; none were skipped. Production data, production cutover, real SMTP delivery, deployment, load and later staff/scheduling APIs are outside this correction.

## Phase 2.2B authentication hardening — 2026-10-25

IMPLEMENTED / TESTED / PENDING EXTERNAL REVIEW. Approved continuation of the existing Phase 2.2B working changes from baseline e856c99ce5f702199c4fffc0ce69f00bbfcd486c. MongoDB remains the business database; PostgreSQL auth is an explicit opt-in and no production cutover or production data access occurred.

- Added configured RS256 signing/retiring public keys, versioned PostgreSQL session families, digest-only refresh rotation/replay revocation, immediate account/session invalidation and one-use password reset with authenticated TLS SMTP delivery.
- Added real Redis source/identity throttling with safe 429/503 responses; exact origins, double-submit CSRF, HttpOnly refresh cookies and a 16 KB authentication body limit.
- Added database-authorized hospital doctor provisioning/activation, scoped doctor memberships, distinct hospital_staff identity links and append-only runtime audit permissions.
- Added manual nonproduction dry-run/validate/apply identity reconciliation with deterministic UUIDv5, preserved source public UID/QR/hash/time/state and hospital sequence counters, atomic per-user checkpoints and conflict refusal. Membership joining times use import time with an explicit audit basis rather than inferred historical dates.
- Integrated frontend mode discovery, memory-only primary PostgreSQL access tokens, refresh/logout and tab coordination. Secondary hospital doctor sessions preserve the administrator cookie.
- Added AUTH_HARDENING.md, updated setup guides, wired hardening tests into test:auth:unit and exposed the frontend test command. Fixed startup-failure cleanup and normalized mixed line endings in the new provisioning migration. The original five migrations are unchanged.

Executed verification, using synthetic disposable services:

| Check | Actual result |
| --- | --- |
| Prisma 6.19.3 validation / generation | PASS / PASS |
| JavaScript syntax | 27 source/script files PASS |
| Authentication unit / prior native authentication checks | 31 / 39 PASS |
| Native session / provisioning checks | 13 / 13 PASS |
| Real Redis distributed-limit checks | 5 PASS |
| Synthetic Mongo/native PostgreSQL identity reconciliation | 16 PASS |
| Mounted Express/PostgreSQL/Redis/Mongo HTTP checks | 15 PASS |
| PostgreSQL infrastructure / infrastructure unit | 24 / 10 PASS |
| Exact native schema / corrective review | 27 / 70 PASS |
| Legacy MongoDB/Express runner passes | 20 PASS |
| Frontend authentication tests | 16 PASS across 2 suites |
| Frontend production build | PASS; existing Browserslist/fs.F_OK warnings |

An initial Redis executable startup and migration CLI startup timed out; their reruns passed. Prisma generation initially encountered a Windows DLL lock while tests were using the engine; it passed with those processes stopped. The infrastructure checksum test caught mixed line endings in the new migration; normalization fixed the failure without changing SQL semantics.

Postgres sessions allow only explicitly reconciled patient profile/QR and hospital-admin self-profile reads in the remaining Mongo business handlers, checked against PostgreSQL ownership. Other protected business routes return AUTH_DOMAIN_NOT_MIGRATED until their domains are migrated. New PostgreSQL-only patients can authenticate but cannot use those legacy handlers. PostgreSQL socket integration remains disabled. The explicit legacy mode retains its documented legacy limitations. Production TLS/SMTP delivery, load, deployment, OAuth/MFA and dependency-vulnerability remediation were not verified or included.

Current configuration, permissions and operator procedures: [backend/prisma/AUTH_HARDENING.md](backend/prisma/AUTH_HARDENING.md).

## JavaScript Standardization — COMPLETE

COMPLETE. External review passed. This historical record describes implementation-language normalization, not a new functional phase.

- Normalized all 17 Phase 2.1/2.2A TypeScript modules to JavaScript/CommonJS with equivalent configuration, lifecycle, identifiers, authentication, reset and ownership behavior. Runtime string validation and a frozen role allowlist preserve important former type boundaries. No backend application TypeScript remains.
- Tests/scripts load src directly. Removed tsconfig.infrastructure.json, build:infra/typecheck, TypeScript and direct @types/node, @types/uuid, @types/bcryptjs and @types/jsonwebtoken dependencies. Transitive Node declarations required by dependencies remain; existing dependency versions are unchanged. Verified generated-only dist was deleted and remains ignored. npm run check:js validates source syntax.
- Keep Prisma schema, all five migrations, permissions and SQL constraints unchanged. MongoDB remains operationally primary; mounted routes, frontend contracts, public MEDIID IDs/QRs and frozen UUIDv5 mapping remain unchanged.
- Do not implement Phase 2.2B, operational auth cutover, dual writes, business-domain migration, Python/FastAPI services or production deployment.

Executed regression checks with dist absent and the TypeScript package removed:

| Check | Actual result |
| --- | --- |
| JavaScript source/script syntax | 20 files PASS |
| Prisma 6.19.3 validation/generation | PASS |
| Phase 1.3.1 PGlite schema/review | 27 + 70 PASS (not multi-session) |
| Exact native PostgreSQL schema/review | 27 + 70 PASS |
| Independent-connection seat/refund/context races | 4 PASS |
| PostgreSQL infrastructure / identifier-config unit tests | 24 / 10 PASS |
| Auth unit / native PostgreSQL integration and runtime permissions | 17 / 39 PASS |
| Disposable MongoDB 7.0.30/Express regressions | 20 runner passes |
| React production build | PASS; existing Browserslist/fs.F_OK warnings |

Native tests used PostgreSQL 18.4, vector 0.8.2 and btree_gist 1.8 with synthetic disposable clusters; all five unchanged migrations deployed under non-superuser Prisma credentials. All test clusters stopped. No required check was skipped. No production data, databases, deployment or AI service were used. No generated evidence was added to the commit; existing historical snapshots remain unchanged.

Setup and authentication boundaries: backend/prisma/DEVELOPMENT.md and AUTH_FOUNDATION.md. Known legacy/security limitations and the deferred Phase 2.2B work remain as documented there.
