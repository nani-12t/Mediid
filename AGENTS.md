# MEDIID development rules

- Use this single active Mediid-main repository. Do not create duplicate project folders, baselines, replacement projects or worktrees.
- Review clean main and origin/main before each phase. The user-authorized solo workflow works on main, verifies all required checks, then creates one complete phase commit and pushes without force. Do not publish intermediate work.
- MongoDB remains the live primary database until explicitly authorized otherwise.
- PostgreSQL migration is incremental. Phase 1.3.1 and merged Phase 2.1 are complete. Phase 2.2A adds isolated authentication/identity services and test-only integration. No operational authentication cutover, dual writes, or Phase 2.2B without explicit approval.
- Never use production data or databases for tests without explicit approval. Use disposable synthetic databases.
- Preserve public MEDIID IDs and the frozen deterministic UUIDv5 namespace. Do not invent historical times.
- Hospital front desk is scoped to its hospital. Private-clinic scheduling belongs to its doctor; there is no clinic receptionist role. Support actions require actors and grant no clinical EHR access.
