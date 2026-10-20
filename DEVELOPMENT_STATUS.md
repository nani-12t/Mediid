# MEDIID development status

Active repository: Mediid-main only.
Reviewed merged main: c9a799240d8d1067fbe341eb8b0cafe7c214a25b (PR #1).
Current branch: fix/phase-1.3.1-review.

## Phase 1.3.1 review fixes

IMPLEMENTED / TESTED / PENDING REVIEW

- Reproduced 54 accepted invalid-write cases against only the two merged migrations: clinical patient/doctor/organization mismatches, parent/reference edits, same-slot deposit/fee/deadline/channel bypasses, and expired-hold replacement.
- Added forward migration 202610200001_phase131_review. Both merged migrations and constraints.sql remain unchanged.
- Clinical links now match the referenced appointment's patient, doctor and organization on INSERT/UPDATE. ConsultationSession gains nullable organization context, backfilled only from the actual parent. Parent edits cannot invalidate linked clinical data; a parent-row serialization counter also protects concurrent clinical linking. Direct encounters and multiple encounters per appointment remain valid.
- Every operational online clinic update enforces the 50 percent deposit. Same-slot edits retain the original snapshot, booking time, channel/source and reserved deadline. Expired holds cannot be replaced or directly confirmed. Valid offline edits and genuine atomic rescheduling remain supported.
- Existing inconsistent clinical links or known online policy violations abort the correction transaction for explicit reconciliation; identity, money and deadlines are never silently rewritten. Missing historical times remain unknown.

Executed checks (synthetic data only):

- Prisma 6.19.3 validation and generation: PASS.
- Existing schema suite: 27 PASS; corrective review suite: 70 PASS in disposable PGlite PostgreSQL, executing all three exact migration files.
- Native disposable PostgreSQL 18.4: 4 independent-connection checks PASS. Competing hospital/clinic seat allocation, refund budgets at READ COMMITTED and REPEATABLE READ, and clinical-link/parent-edit races are covered. The temporary clusters were stopped; installed database services were not used.
- MongoDB 7.0.30/backend regressions: 12 test-runner passes (5 startup checks, 6 HTTP checks and their container). Live MongoDB remains primary.
- Fresh npm audit of this branch's current lockfile: 26 vulnerabilities (2 critical, 18 high, 5 moderate, 1 low). No forced upgrades or dependency remediation were included; these findings are not copied from any deleted implementation.

Limits and Phase 2.1 gates:

- Exact unmodified native migration execution: NOT EXECUTED because native pgvector is unavailable. The native race runner omitted only the unused CREATE EXTENSION vector statement; no schema table, index, check or trigger was omitted. PGlite executed all migrations unmodified with vector and btree_gist. Install pgvector and run exact native migration deployment before Phase 2.1.
- Runtime access provisioning, historical channel/source auditing and current dependency findings remain review gates. No production data or databases were accessed and no production migration/cutover occurred.

Evidence: backend/test-results/phase131-review-verification.json and the review reproduction/PostgreSQL/native/dependency reports. SQL contract: backend/prisma/SQL_CONSTRAINTS.md.

## Phase 2.1

NOT STARTED

READY FOR EXTERNAL REVIEW. Do not merge automatically or start Phase 2.1.
