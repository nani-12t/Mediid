# MEDIID development status

Active repository: Mediid-main only.
Branch: feature/phase-1.3.1-schema-hardening
Reviewed main/origin baseline: 43049d5c1281327a0884adb81181402d2ede5482.

## Phase 1.3.1

IMPLEMENTED / TESTED / PENDING REVIEW

Implemented separate appointment payment/refund ledgers with Decimal/currency/idempotency, retained financial audit history and atomic partial-refund budgets. Shared per-booking reservation rows replace the global slot holder. Executable PostgreSQL constraints enforce doctor interval exclusion, capacity, appointment-slot identity, encounter domain exclusivity, deadline bounds, support attribution and patient-approved transfers. Provider policies expose structured cancellation/reschedule/no-show defaults. Public MEDIID IDs and the frozen UUIDv5 migration namespace are unchanged. Unknown historical times remain in legacy appointments.

Verification:

- Prisma 6.19.3 validate: PASS; generate: PASS. CLI/client are pinned together.
- PostgreSQL: 27 checks PASS against the exact committed full-schema and constraint migrations in disposable PGlite PostgreSQL 17.5 with vector and btree_gist.
- MongoDB 7.0.30/Express: 12 test-runner passes, comprising 5 existing startup checks, 6 HTTP regressions and their container test. Registration, login, public MEDIID UID and authorization behavior preserved.
- Test credentials/data were synthetic. No production databases, installed database services, external notification services or production data were used.
- server.js only gains an explicit DOTENV_CONFIG_PATH override for isolated tests. Live MongoDB routes and data ownership remain primary.
- Results and artifact hashes are in backend/test-results/phase131-verification.json. SQL contract and execution order are in backend/prisma/SQL_CONSTRAINTS.md.

Review limits and remaining issues:

- Native multi-session concurrency/load testing remains a follow-up; PGlite runs the real PostgreSQL engine but one session. The SQL uses unique seat indexes and an atomic parent refund counter to protect concurrent writes.
- npm audit reports 26 dependency vulnerabilities (2 critical, 18 high, 5 moderate, 1 low). No forced dependency upgrade or Phase 2 security implementation was included.
- Existing populated PostgreSQL targets need a separate reconciliation/backfill and conflict audit. Runtime access provisioning must reserve migration provenance to the migration writer and keep the application role from owning/altering schema objects.
- This phase supplies schema, executable constraints and tests; payment/refund services, production authorization and cutover are not implemented or deployed.

## Phase 2.1

NOT STARTED

Final phase status: READY FOR EXTERNAL REVIEW. Do not merge or start Phase 2.1 without instruction.
