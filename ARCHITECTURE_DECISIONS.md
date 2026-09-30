# Architecture Decision Records (ADR) — MEDIID Platform

This document records the frozen technology, architectural, and data engineering decisions for the MEDIID platform prior to Phase 2 implementation.

---

## ADR-001: PostgreSQL as Primary Transactional Database

### Context
MEDIID currently uses MongoDB with Mongoose across two disparate databases (`mediid` and `mediid_marketplace`). The patient record embeds clinical history, medical documents, bills, and benefits into a single BSON document, which risks hitting MongoDB's 16MB document size limit and causes high write amplification. Cross-collection and cross-database transactions are difficult to maintain reliably.

### Decision
Migrate the primary transactional database to **PostgreSQL**.

### Rationale
- ACID compliance and robust transaction isolation across clinical encounters, billing, and scheduling.
- Strict relational constraints, foreign keys, and unique indexes to prevent orphaned medical records.
- First-class support for normalized relational modeling alongside JSONB for flexible semi-structured data.
- Built-in `pgvector` extension for future unified AI retrieval without requiring a separate vector database.

### Consequences
- Requires an explicit data migration pipeline from MongoDB.
- Mongoose ODM must be replaced by a modern SQL ORM (Prisma).

---

## ADR-002: Prisma as the Standard ORM

### Context
Node.js supports multiple ORMs (Prisma, Drizzle, Sequelize, TypeORM). Phase 1 analysis mentioned both Drizzle and Prisma, creating ambiguity in the technology stack.

### Decision
Freeze **Prisma** as the exclusive ORM for MEDIID backend services starting in Phase 2.

### Rationale
- Declarative, single-source-of-truth schema (`schema.prisma`) with auto-generated, type-safe TypeScript clients.
- Automated migration tooling (`prisma migrate`) with drift detection and deterministic schema synchronization.
- Superior developer productivity, comprehensive relation filtering, nested writes, and interactive database exploration via Prisma Studio.

### Consequences
- Complex custom SQL functions (like advanced pgvector distance queries) will use `$queryRaw` where standard Prisma query builders do not expose specialized PostgreSQL extensions natively.

---

## ADR-003: Node.js / Express Modular Monolith for Core Backend

### Context
There was consideration of microservices versus a monolithic architecture. The current application is a single Express server.

### Decision
Retain **Node.js + Express.js as a Modular Monolith**. Microservices are explicitly rejected for this phase.

### Rationale
- Prevents distributed transaction overhead, network latency, and orchestration complexity for clinical workflows.
- Modular domain boundaries (`modules/auth`, `modules/patients`, `modules/doctors`, `modules/encounters`, etc.) allow independent development while sharing a unified database connection pool.
- Allows gradual migration from existing Express routes without rewriting the entire application.

### Consequences
- Module boundaries must be strictly enforced through internal service interfaces to avoid cross-module spaghetti imports.

---

## ADR-004: FastAPI Boundary for Future AI & Heavy Compute Services

### Context
MEDIID aims to provide OCR, Clinical NLP, RAG, and AI patient assistance. Running heavy ML models and Python-centric data pipelines inside Node.js is suboptimal.

### Decision
Introduce a dedicated **Python FastAPI service** exclusively for AI workloads (OCR, RAG, NLP, Summarization). **DO NOT** implement FastAPI in Phase 1 or early Phase 2.

### Rationale
- Python has the preeminent ecosystem for AI/ML (HuggingFace, PyTorch, LangChain, LlamaIndex, Google Vision, SpaCy).
- Keeps the Express API lightweight, responsive, and focused strictly on high-throughput transactional CRUD operations.

### Consequences
- Node.js will communicate asynchronously with FastAPI via HTTP/REST or BullMQ event queues when AI features are introduced in Phase 3.

---

## ADR-005: UUIDv5 for Migrated MongoDB Records

### Context
Existing MongoDB documents use 24-character hexadecimal `ObjectId` strings. PostgreSQL tables use standard 16-byte UUID primary keys. Randomly generating new UUIDs during migration would make migration scripts non-idempotent and break foreign-key relationships on retries.

### Decision
Use **UUIDv5** (deterministic SHA-1 hashing against a fixed MEDIID namespace) to convert all existing MongoDB ObjectIds:
$$\text{PostgreSQL UUID} = \text{uuidv5}(\text{mongoObjectId.toString()}, \text{MEDIID\_NAMESPACE})$$

### Rationale
- Completely deterministic and idempotent: running the migration multiple times produces identical primary and foreign keys.
- Preserves referential integrity across related collections without needing persistent lookup tables.

### Consequences
- Migration scripts must use the exact same namespace constant (`MEDIID_NAMESPACE`).

---

## ADR-006: UUIDv7 for Newly Created Records

### Context
Random UUIDv4 identifiers cause severe B-tree index fragmentation and cache misses at scale. Standard PostgreSQL `gen_random_uuid()` generates UUIDv4, not time-ordered UUIDv7.

### Decision
Use **UUIDv7** for all new records created after the PostgreSQL cutover, generated at the application layer via a well-maintained library (e.g. `uuidv7`).

### Rationale
- UUIDv7 embeds a Unix millisecond timestamp prefix, giving it natural time-ordered monotonicity.
- Retains sequential B-tree insertion performance comparable to BIGINT, while maintaining distributed collision-free generation and obscuring record enumeration.

### Consequences
- Application services and repositories will generate UUIDv7 prior to calling Prisma `create` operations, while schema columns use standard `UUID` types.

---

## ADR-007: Existing MEDIID UID Formats Remain Public Identifiers

### Context
MEDIID uses business identifiers:
- Patient: `MID-XXXXXXXX`
- Hospital: `HID-XXXXXXXX`
- Doctor/Staff: `HID-XXXXXXXX-DOC-0001` / `HID-XXXXXXXX-STF-0001`

### Decision
Internal PostgreSQL UUIDs (`id`) are system primary keys and **must never replace** public MEDIID UIDs (`uid`).

### Rationale
- Existing QR codes, physical badges, SMS confirmation links, and printed hospital sheets depend on public UIDs.
- Public UIDs are human-readable, auditable, and tied to hospital organizational hierarchies.

### Consequences
- PostgreSQL schemas maintain both an internal `id UUID PRIMARY KEY` and a `uid VARCHAR UNIQUE` column.

---

## ADR-008: Encounter-Centered Longitudinal EHR

### Context
In the MongoDB schema, medical history and prescriptions are arrays embedded on the `Patient` document. Appointments were conflated with clinical care visits.

### Decision
Decompose the health record into an **Encounter-centered longitudinal architecture**:
- `Appointment`: Administrative/scheduling event (date, time slot, booking status, confirmation).
- `Encounter`: The actual clinical episode of care (ambulatory, emergency, inpatient, virtual).
- Clinical sub-entities (`vitals`, `clinical_notes`, `conditions`, `prescriptions`, `lab_orders`, `imaging_orders`) attach directly to the `Encounter`.

### Rationale
- An appointment may be cancelled or rescheduled without creating an encounter.
- Emergency walk-ins or past medical history imports can create an encounter without requiring an appointment.
- Aligns with international healthcare standards (HL7 FHIR `Encounter`).

### Consequences
- Historical medical history will be migrated into synthetic historical encounters.

---

## ADR-009: Data Marketplace Isolation from Clinical EHR Authorization

### Context
The platform includes a research marketplace where pharmaceutical/research buyers post requirements and patients submit medical records for compensation.

### Decision
The **Data Marketplace domain is strictly isolated** from clinical EHR authorization.
- Buyers receive zero direct access to patient tables or the clinical EHR.
- Data exchange occurs solely through explicit, de-identified `dataset_submissions` and `submission_documents`.
- Patient consent is mandatory per requirement.

### Rationale
- Protects patient confidentiality and prevents accidental data leakage to unauthorized third parties.
- Enforces strict compliance with healthcare data protection principles.

### Consequences
- Marketplace models reside in dedicated tables and have zero foreign keys granting read permissions to live patient clinical notes or appointments.

---

## ADR-010: Incremental JavaScript → TypeScript Migration

### Context
The current backend is written in CommonJS JavaScript. Rewriting the entire application to TypeScript before database migration would create a massive, untestable diff.

### Decision
Adopt an **incremental coexistence strategy**:
- Existing routes and models remain in JavaScript during initial setup.
- All new modules, Prisma services, and repositories are written in TypeScript (`src/**/*.ts`).
- `tsconfig.json` configured with `allowJs: true` to execute both seamlessly under `ts-node` / `tsx` and compile via `tsc`.

### Rationale
- Eliminates regression risks and allows immediate testing of database modules without waiting for a full codebase rewrite.

### Consequences
- Build pipeline must handle both JS and TS assets until legacy routes are decommissioned.

---

## ADR-011: PostgreSQL + pgvector as Initial Vector Infrastructure

### Context
Future AI features require semantic search over medical documents and RAG workflows. Introducing Pinecone, Qdrant, or Weaviate adds unnecessary operational overhead.

### Decision
Enable the `vector` extension in PostgreSQL (`pgvector`) for vector storage.

### Rationale
- Eliminates the cost, operational overhead, and data-synchronization lag of running an external vector database.
- Allows transactional consistency between relational clinical data and document vector embeddings.

### Consequences
- When the FastAPI AI service is introduced, it will query the same PostgreSQL database using pgvector.

---

## ADR-012: Controlled Database Cutover Rather Than Simple Feature-Flag Rollback

### Context
The Phase 1 migration plan suggested using `USE_POSTGRES=false` as a rollback mechanism. This is unsafe once PostgreSQL starts receiving writes, as MongoDB would become stale and cause catastrophic data loss if rolled back.

### Decision
Adopt a **multi-stage controlled migration with synchronization**:
1. **Stage A**: MongoDB = Primary. PostgreSQL = Provisioned with Prisma schema.
2. **Stage B**: Historical backfill (MongoDB → PostgreSQL via deterministic UUIDv5).
3. **Stage C**: Shadow-read verification (compare responses between MongoDB and PostgreSQL).
4. **Stage D**: Dual-write synchronization period using an outbox pattern / event queue.
5. **Stage E**: Consistency verification and data reconciliation.
6. **Stage F**: Controlled cutover (PostgreSQL = Primary).
7. **Stage G**: MongoDB retained read-only for audit and disaster-recovery window (14 days).

### Rationale
- Guarantees zero data loss and ensures that no write is lost if an emergency fallback is required before cutover.

### Consequences
- Requires dual-write synchronization and consistency check scripts prior to final cutover.
