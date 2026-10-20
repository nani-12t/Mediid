# MEDIID development status

Single active repository: Mediid-main.
Reviewed main: 5a59c41e7a68428a2697f988611785134c9e5782 (merged PR #2).
Branch: feature/phase-2.1-postgres-infrastructure.

## Phase 1.3.1 closure

EXACT NATIVE VERIFICATION CLOSED.

PostgreSQL 18.4 executed the three merged migrations unchanged, in order: 202610190001_phase131_baseline, 202610190002_phase131_constraints, 202610200001_phase131_review. Real pgvector 0.8.2 and btree_gist 1.8 installed successfully; a vector operator smoke test passed. Native schema/review regressions: 27 + 70 PASS. Native independent-connection seat/refund/context races: 4 PASS, with no SQL omission. All merged migrations and constraints.sql remain unchanged. The test fixture now copies exact reservation deadlines in SQL to preserve native microsecond precision.

## Phase 2.1

IMPLEMENTED / TESTED / PENDING REVIEW.

- Validated environment-specific runtime/migration/diagnostic URLs with distinct database identities, bounded pooling/timeouts/retries and strict production TLS requirements. No database URL or credential fallback.
- Central Prisma owner with deduplicated initialization, readiness gating, checksum/migration status checks, controlled reuse and idempotent shutdown. Development diagnostics redact credentials and sensitive data.
- Separate non-superuser migrator, runtime and read-only diagnostic roles. New migration 202610200002_phase21_infrastructure_permissions grants only infrastructure metadata access. Runtime cannot modify schema/history, read clinical tables, perform business writes or assume the migration role.
- Frozen UUIDv5 namespace and deterministic canonical ObjectId mapping preserved; separate pinned UUIDv7 helper added. Existing public MEDIID IDs/legacy UUID dependency preserved.
- PostgreSQL remains isolated and is not initialized by existing Express routes. MongoDB authentication, appointments, frontend contracts and models remain operationally primary; no dual writes, business repositories, data migration or FastAPI replacement.

Executed verification:

- Prisma 6.19.3 validate/generate: PASS; TypeScript checks/build: PASS.
- Native exact Phase 1.3.1 gate: 97 checks PASS; independent-connection concurrency: 4 PASS.
- Native infrastructure tests: 24 PASS, including real Prisma deployment/status of all four migrations, roles, pools, failure/retry behavior, drift and process shutdown.
- Configuration/identifier tests: 10 PASS. MongoDB 7.0.30/Express regressions: 12 test-runner passes with synthetic data. React production build: PASS; API/route/model source unchanged.
- Fresh audit: backend 26 findings (2 critical, 18 high, 5 moderate, 1 low); frontend 105 (3 critical, 78 high, 19 moderate, 5 low). Actual advisory paths/chains are in security/audits/phase21. No forced upgrades were performed.

Limits and setup:

- Tests used fresh loopback-only SCRAM-authenticated native clusters and disposable MongoDB. Clusters were stopped; installed database services, production databases and real patient data were not used.
- Windows pgvector test build is pinned/checksummed and staged under ignored .test-data using PostgreSQL 18 extension paths. No Program Files extension changes, binaries, credentials, generated clients or frontend build artifacts are committed.
- Production TLS-chain verification, managed poolers, production-scale load and production deployment were not executed. Current dependency security findings remain unresolved. Frontend build warned about old Browserslist data and Node's deprecated fs.F_OK use.
- Fresh setup, roles and migration/run commands: backend/prisma/DEVELOPMENT.md. Evidence: backend/test-results/phase21-*.json; audit evidence: security/audits/phase21.

## Phase 2.2 authentication

NOT STARTED. Do not merge automatically, deploy or begin the next phase without instruction.

READY FOR EXTERNAL REVIEW.
