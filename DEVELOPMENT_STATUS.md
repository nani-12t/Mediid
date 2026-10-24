# MEDIID development status

MEDIID Node/Express backend language: JavaScript/CommonJS.
Do not introduce TypeScript into the Node backend.
Python/FastAPI is reserved for the separate AI service.

Single active repository: Mediid-main. Reviewed baseline: eefcc3386709fa91ce6163f5da412a88778850ab.
Workflow: direct-to-main; one tested standardization commit, no intermediate pushes.

| Phase | Status |
| --- | --- |
| Phase 1.3.1 | COMPLETE |
| Phase 2.1 | COMPLETE |
| Phase 2.2A | COMPLETE |
| Phase 2.2B | NOT STARTED |

## JavaScript backend standardization

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
