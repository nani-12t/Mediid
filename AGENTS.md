# MEDIID development rules

- Use this single active Mediid-main repository. Do not create duplicate project folders, baselines, replacement projects or worktrees.
- Review clean main and origin/main before each phase; work on a dedicated phase branch, test, commit, push that branch, and request review. Never merge without instruction.
- MongoDB remains the live primary database until explicitly authorized otherwise.
- PostgreSQL migration is incremental. Phase 1.3.1 exact-native verification is closed; Phase 2.1 provides isolated infrastructure only. No business cutover, dual writes, or Phase 2.2 authentication without explicit approval.
- Never use production data or databases for tests without explicit approval. Use disposable synthetic databases.
- Preserve public MEDIID IDs and the frozen deterministic UUIDv5 namespace. Do not invent historical times.
- Hospital front desk is scoped to its hospital. Private-clinic scheduling belongs to its doctor; there is no clinic receptionist role. Support actions require actors and grant no clinical EHR access.
