# MEDIID development status

MEDIID Node/Express backend language: JavaScript/CommonJS.
Do not introduce TypeScript into the Node backend.
Python/FastAPI is reserved for the separate AI service.

Single active repository: Mediid-main. Reviewed baseline: eefcc3386709fa91ce6163f5da412a88778850ab.
Workflow: direct-to-main; one tested phase commit, no intermediate pushes.

| Phase | Status |
| --- | --- |
| Phase 1.3.1 | COMPLETE |
| Phase 2.1 | COMPLETE |
| Phase 2.2A | COMPLETE |
| Phase 2.2B | IMPLEMENTED / LOCALLY VERIFIED; pending external review |

## Phase 2.2B authentication hardening — 2026-10-25

IMPLEMENTED / LOCALLY VERIFIED / PENDING EXTERNAL REVIEW. Approved continuation of the existing Phase 2.2B working changes from baseline e856c99. MongoDB remains the business database; PostgreSQL auth is an explicit opt-in and no production cutover or production data access occurred.

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

## JavaScript backend standardization (historical)

IMPLEMENTED / TESTED / PENDING EXTERNAL REVIEW. This is implementation-language normalization, not a new functional phase.

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
