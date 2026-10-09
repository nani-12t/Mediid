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

### MEDIID Migration Namespace (FROZEN — Phase 1.2)

> **This value is permanently frozen. It MUST NOT be changed after Phase 2 begins.**
> Changing it after any migration script has run will shatter all foreign-key integrity.

```
MEDIID_MIGRATION_NAMESPACE = 57c0c744-9cdc-41f9-a532-7e60be63d87f
```

This is a MEDIID-specific UUID namespace, generated once using UUIDv4 and permanently frozen here. It is **not** a standard RFC 4122 namespace.

**Usage in migration scripts:**
```javascript
const { v5: uuidv5 } = require('uuid');
const MEDIID_MIGRATION_NAMESPACE = '57c0c744-9cdc-41f9-a532-7e60be63d87f';

function mongoIdToPostgresUuid(objectIdStr) {
  return uuidv5(String(objectIdStr), MEDIID_MIGRATION_NAMESPACE);
}
```

### Rationale
- Completely deterministic and idempotent: running the migration multiple times produces identical primary and foreign keys.
- Preserves referential integrity across related collections without needing persistent lookup tables.
- A MEDIID-specific namespace (not the RFC URL or DNS namespace) prevents accidental collision with any UUIDs generated outside this project.

### Consequences
- Migration scripts must use the exact namespace constant `57c0c744-9cdc-41f9-a532-7e60be63d87f`.
- This value is recorded in both this file and `DATABASE_MIGRATION_PLAN.md`.

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
The platform includes a research marketplace where pharmaceutical/research buyers post requirements and patients submit medical records for compensation. The original Consent model included a generic `granteeType = researcher` value, which risks blurring the boundary between clinical access and research marketplace authorization.

### Decision
The **Data Marketplace domain is strictly isolated** from clinical EHR authorization with two distinct consent systems:

#### Clinical Consent (`consents` table)
- Covers healthcare access only: `granteeType` ∈ `{ doctor, hospital, clinic }`
- Purpose values: `clinical_care | second_opinion | treatment | referral`
- Researchers and buyers **NEVER** appear in this model.

#### Research Marketplace Authorization (separate models — Phase 1.2)
A dedicated chain of models enforces the controlled data flow:

| Model | Purpose |
|---|---|
| `DatasetConsent` | Patient's explicit consent per research requirement. Scoped, time-bounded, revocable. |
| `ApprovedDataset` | Versioned de-identified dataset snapshot produced after consent and review. |
| `DatasetAccessGrant` | Time-bounded authorization for a buyer to access an ApprovedDataset. |
| `DatasetAccessLog` | Immutable audit trail of buyer access actions. |

**Controlled access flow:**
```
ResearchRequirement → DatasetSubmission → DatasetConsent
  → De-identification → ApprovedDataset
  → DatasetAccessGrant → Researcher access → DatasetAccessLog
```

- Buyers receive zero direct access to `patients`, `encounters`, `clinical_notes`, `prescriptions`, `lab_results`, `imaging_studies`, or any other live EHR entity.
- Data exchange occurs solely through `ApprovedDataset` records (de-identified snapshots).
- Patient consent is mandatory via `DatasetConsent` per requirement.

### Rationale
- Protects patient confidentiality and prevents accidental data leakage to unauthorized third parties.
- Enforces strict compliance with healthcare data protection principles.
- Clear separation of clinical consent from research consent eliminates authorization ambiguity.

### Consequences
- Marketplace models reside in dedicated tables and have zero foreign keys granting read permissions to live patient clinical notes or appointments.
- The `contextAccessGuard` middleware will enforce that buyer-role JWT tokens cannot access any clinical EHR endpoint.

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

---

## ADR-013: Organizational Context Invariant on Every Appointment (Phase 1.2)

### Context
The current `Doctor` model supports `isPrivatePractice = true` and a nullable `primaryHospitalId`, allowing a private-practice doctor to exist with no hospital affiliation. The original `Appointment` schema has `hospitalId NOT NULL`, but there was no documented architectural decision to match. This created a potential inconsistency: slots could be created with `hospitalId = null` while appointments required a non-null `hospitalId`.

### Decision
**Every clinical Appointment MUST carry a non-null `hospitalId` pointing to a `Hospital` record.**

Private clinics and independent doctors are supported by representing the clinic as a `Hospital` record with `type = clinic` rather than creating organization-less appointments.

**Invariant**:
```
Appointment.hospitalId IS NOT NULL — always.
```

**Supported organization types** (`Hospital.type` enum):
| Value | Use Case |
|---|---|
| `government` | Government-run hospitals / PHCs |
| `private` | Private multispeciality / single-specialty hospitals |
| `trust` | Charitable / trust-run hospitals |
| `clinic` | Private clinic (individual or group practice) |

**Workflow for independent private-practice doctors:**
1. Create a `Hospital` record with `type = clinic` and the doctor's clinic name.
2. Create a `DoctorHospitalMembership` linking the doctor to the clinic.
3. Create appointments against this clinic organization record.

**`DoctorSlot.hospitalId` remains NULLABLE** because a slot template is defined at the practitioner availability level, independent of which specific organization context is used at booking time. The organizational context is enforced at the `Appointment` level, not the slot template level.

### Rationale
- Eliminates organization-less appointment gaps in billing, audit, and compliance reporting.
- Preserves backward compatibility: `Hospital` is not renamed; `type = clinic` extends its semantics.
- Avoids introducing a separate `Organization` model in Phase 2, which would require significant migration complexity.

### Consequences
- All appointment creation endpoints must validate that a `Hospital` record exists before persisting the appointment.
- Phase 2.1 schema validation must enforce `hospitalId NOT NULL` at the database level (already done in `schema.prisma`).
- Phase 2.3 must implement a clinic creation flow for independent private-practice doctor onboarding.

---

## ADR-014: Split Scheduling Domains (Hospital vs. Private Clinic) & Materialized Slots

### Context
In previous phases, `Appointment` conflated two distinct scheduling domains:
1. Multi-physician, front-desk-managed institutional hospital scheduling.
2. Solo or group practitioner-owned private clinic practices.
Furthermore, virtual slot queries calculated availability on-the-fly from recurring day schedules (`DoctorSlot`), which allowed race conditions, double booking across multi-facility practices, and complex concurrency edge cases.

### Decision
1. **Separate Scheduling Domains**:
   - `HospitalAppointment`: Front-desk managed, hospital organization bound (`hospitalId NOT NULL`). Confirmation modes: `DEPOSIT`, `TIME_BASED`, or `MANUAL`.
   - `PrivateClinicAppointment`: Doctor-owned strictly. **Explicitly NO receptionist or front-desk role/portal**. Online bookings require a **mandatory 50% consultation deposit**.
   - Both domains link to the shared Encounter/EHR system (`Encounter.hospitalAppointmentId` and `Encounter.privateClinicAppointmentId`), while `Encounter` also supports direct creation without any appointment (walk-in emergency or legacy records).
   - Legacy `Appointment` is retained for historical/backward compatibility.
2. **Materialized Appointment Slots (`MaterializedAppointmentSlot`)**:
   - Discrete rows with channels `ONLINE`, `OFFLINE`, and `FLEXIBLE`.
   - States: `AVAILABLE`, `HELD`, `BOOKED`, `BLOCKED`, `EXPIRED`.
   - Unique constraint `@@unique([doctorId, slotStart])`: Prevents double booking the same doctor across hospital and clinic contexts at the database level.
   - Slot templates (`RecurringAvailabilityTemplate`) and `ScheduleOverride` (leave, emergency block, custom hours, holidays) materialize into concrete slot records.
   - Slot reopening: Cancelled or payment-expired slots automatically reset to `AVAILABLE` with incremented `reopenedCount` and `holdExpiresAt = null`.

### Rationale
- Completely isolates the hospital front-desk workflow from private doctor operations.
- Strong ACID relational uniqueness (`doctorId, slotStart`) prevents practitioner scheduling conflicts across multiple hospitals or clinics.
- Eliminates on-the-fly slot calculation races.

### Consequences
- Scheduling engines book against `MaterializedAppointmentSlot` rows using `SELECT ... FOR UPDATE` row locks.

---

## ADR-015: Dynamic Payment Deadlines, Late-Booking Cutoffs & Hold Expiry

### Context
Fixed payment hold windows (e.g. 60 minutes) cause invalid states when an appointment is booked near its start time (e.g. 20 minutes before). A fixed 60-minute hold would expire *after* the appointment starts.

### Decision
Define a dynamic payment deadline calculation:
$$\text{holdDuration} = \min\left(60\text{ min},\; \text{slotStart} - \text{now} - 10\text{ min safety cutoff}\right)$$

1. **Standard Window**: 60 minutes when booking well in advance.
2. **Safety Cutoff**: Online bookings close 10 minutes before `slotStart` ($\text{leadTime} \le 10\text{ min} \implies \text{rejected}$).
3. **Fast-Confirm Window**: When lead time is between 10 and 15 minutes before slot start:
   $$\text{leadTime} \in (10\text{ min}, 15\text{ min}] \implies \text{holdDuration} = 5\text{ min fast-confirm}$$
4. **Boundary Invariant**:
   - If lead time $< 10$ minutes: Online booking is closed. Returns HTTP 400 (`BOOKING_CLOSED_SAFETY_CUTOFF`).
   - If computed payment deadline $\le \text{now}$: **NEVER create an expired or zero-duration hold**. The booking transaction aborts immediately.
5. **Offline & Walk-in Exemption**: Offline/walk-in appointments do not require online payment holds (`paymentHoldStatus = NONE`).

### Rationale
- Prevents holds lingering into clinical consultation time.
- Guarantees doctors and patients have definitive slot confirmation before the visit starts.

---

## ADR-016: Provider-Configurable Cancellation, Refund Policy & Audit Integrity

### Context
Cancellations and refunds require provider flexibility while protecting patient rights. Provider-initiated cancellations must not penalize patients.

### Decision
1. **Configurable Policies**:
   - Hospitals configure cancellation and reschedule cutoff hours via `HospitalSchedulingRule`.
   - Private clinic doctors configure cutoffs, reschedule limits, and no-show fee deductions via `DoctorClinicPolicy`.
2. **Provider-Initiated Cancellations**:
   - When cancelled by `DOCTOR` or `HOSPITAL_FRONT_DESK`, the platform guarantees **100% full refund** of any amount paid or offers an explicitly agreed transfer credit (`TRANSFER_CREDIT_OFFERED`).
3. **Refund Transactions & Payment History Preservation**:
   - Never overwrite or mutate original payment records.
   - Refund details are recorded in dedicated fields (`refundStatus`, `refundAmount`, `refundTransactionRef`) and linked to `BillingRecord` maintaining full audit history.
4. **Rescheduling**:
   - Allowed up to provider-configured cutoff (`maxRescheduleCount`). Previous slot is reopened to `AVAILABLE`, and new slot is reserved atomically.

---

## ADR-017: SUPPORT_ASSISTED Bookings & Restricted Clinical Access

### Context
Customer support agents assist patients with scheduling and billing issues via phone or chat. Unrestricted support access risks exposing protected health information (PHI).

### Decision
1. **Role**: Dedicated `support_agent` in `UserRole` enum.
2. **Booking Permissions**:
   - Can book on behalf of patients (`bookingChannel = SUPPORT_ASSISTED`, tracking `bookedByUserId`).
   - Must strictly respect all provider scheduling rules and cancellation cutoffs; **support agents cannot bypass provider policies**.
3. **Clinical Access Restriction**:
   - Support agents are strictly forbidden from viewing clinical EHR data (SOAP notes, vitals, conditions, lab results, prescriptions).
   - Restricted to administrative/scheduling metadata and billing receipts.
   - Every support action is logged in `access_logs` with `action = support_assisted_booking`.
