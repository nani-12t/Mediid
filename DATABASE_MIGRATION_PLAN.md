# MEDIID Database Migration Plan: MongoDB to PostgreSQL (Frozen)

## 1. Primary Identifier & Extension Strategy

### 1.1 Existing MongoDB Records (Deterministic UUIDv5)
Every MongoDB collection row has an `_id` represented as a 24-character hexadecimal `ObjectId`. To guarantee that migration scripts can be executed repeatedly with zero foreign-key divergence:
- Convert every `ObjectId` using **UUIDv5** with a fixed namespace:
  ```javascript
  const { v5: uuidv5 } = require('uuid');
  const MEDIID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Fixed RFC 4122 namespace
  
  function mongoIdToPostgresUuid(objectIdStr) {
    return uuidv5(String(objectIdStr), MEDIID_NAMESPACE);
  }
  ```
- Any related document referencing that `ObjectId` will calculate the exact same UUID, ensuring foreign-key integrity without requiring stateful ID mapping tables.

### 1.2 Newly Created PostgreSQL Records (UUIDv7)
- After cutover, new rows generate sequential **UUIDv7** primary keys.
- **Implementation**: Generated at the application layer using a dedicated library (e.g. `uuidv7` in npm) before passing records to Prisma `create` calls:
  ```typescript
  import { uuidv7 } from 'uuidv7';
  
  const newAppointmentId = uuidv7();
  await prisma.appointment.create({
    data: {
      id: newAppointmentId,
      ...appointmentData
    }
  });
  ```
- **PostgreSQL DDL**: Columns simply use standard `UUID PRIMARY KEY`. We do not rely on `gen_random_uuid()` for UUIDv7.

### 1.3 Public Business Identifiers
- `patients.uid` (`MID-XXXXXXXX`)
- `hospitals.uid` (`HID-XXXXXXXX`)
- `doctors.uid` (`HID-XXXXXXXX-DOC-0001` or `DOC-XXXXXXXX`)
- `hospital_memberships.uid` (`HID-XXXXXXXX-STF-0001`)

These public UIDs **remain 100% stable** and continue to be used in QR codes, badge scans, SMS links, and frontend routing.

### 1.4 PostgreSQL Extensions
- `vector`: Enabled via `CREATE EXTENSION IF NOT EXISTS vector;` for future pgvector document embeddings.
- No obsolete `uuid-ossp` dependencies are required for primary key generation since UUIDs are provided by application services.

---

## 2. Relational Normalization & Transformation Map

### 2.1 Patient Decomposition
The embedded arrays on MongoDB's `Patient` are extracted into distinct relational tables:

| MongoDB Source | PostgreSQL Target | Extraction & Mapping Strategy |
| :--- | :--- | :--- |
| `Patient` (root document) | `patients` | Demographics, phone, address, emergency profile, UID, and user relation |
| `Patient.documents[]` | `medical_documents` | Document type, file URL, metadata, uploaded by user ID |
| `Patient.bills[]` | `billing_records` | Normalizes custom patient diagnostic bills (`billId` -> `bill_code`) |
| `Patient.medicalBenefits[]` | `patient_benefits` | Government, employer, and personal insurance benefits |
| `Patient.medicalHistory[]` | `encounters` + `clinical_notes` + `conditions` | Historical visits transformed into completed encounters with notes and diagnosed conditions |
| `Patient.trustedDoctors[]` | `patient_trusted_doctors` | Many-to-many join rows |
| `Patient.trustedHospitals[]` | `patient_trusted_hospitals`| Many-to-many join rows |

### 2.2 Appointment & Prescription Normalization
| MongoDB Source | PostgreSQL Target | Transformation Strategy |
| :--- | :--- | :--- |
| `Appointment` | `appointments` | Booking dates, time slots, status (normalized to lowercase enum), confirm tokens |
| `Appointment.prescription` | `prescriptions` + `prescription_items` | Prescription text parsed/mapped into structured prescription rows |
| `ConsultationSession` | `consultation_sessions` | Mapped 1:1 using UUIDv5 for access session tokens |

### 2.3 Organization & Staff Normalization
| MongoDB Source | PostgreSQL Target | Transformation Strategy |
| :--- | :--- | :--- |
| `Hospital` | `hospitals` | Facilities, bed counts, location, rating, and sequence counters |
| `Doctor` | `doctors` + `doctor_hospital_memberships` | Doctor profile created; join row inserted linking doctor to hospital |
| `Staff` | `hospital_memberships` | Non-physician hospital personnel |
| `Pharmacy` | `pharmacies` | Hospital pharmacy profile |

### 2.4 Marketplace Normalization
| MongoDB Source (Secondary DB) | PostgreSQL Target | Transformation Strategy |
| :--- | :--- | :--- |
| `Buyer` | `buyers` | Company profile, contact, user reference |
| `Requirement` | `research_requirements` | Research dataset specs, target sample size, pricing JSONB |
| `Submission` | `dataset_submissions` + `submission_documents` | Patient submission with extracted child document rows |
| `Message` | `marketplace_messages` | Chat messages between buyer and patient |

---

## 3. Safe Cutover & Rollback Protocol (Multi-Stage Migration)

Simply toggling a boolean flag (`USE_POSTGRES=false`) is unsafe once PostgreSQL begins receiving writes because MongoDB would be out of sync. We employ a controlled 7-stage cutover protocol:

```
[ STAGE A: Provision & Baseline ]
  ├── PostgreSQL database provisioned with Prisma schema
  └── MongoDB running as primary read/write database
        │
        ▼
[ STAGE B: Historical Backfill ]
  ├── Idempotent batch extraction script runs (MongoDB -> PostgreSQL)
  └── Transforms ObjectIds -> UUIDv5, normalizes embedded arrays
        │
        ▼
[ STAGE C: Shadow Read Verification ]
  ├── Express routes query PostgreSQL in parallel on read operations
  └── Discrepancy detector logs any mismatch between MongoDB and PostgreSQL
        │
        ▼
[ STAGE D: Controlled Dual-Write via Outbox ]
  ├── All mutation routes write to MongoDB (primary) and an Outbox queue
  └── BullMQ worker applies writes to PostgreSQL with retry and idempotency
        │
        ▼
[ STAGE E: Consistency Verification ]
  ├── Automated audit script verifies row counts, sums, and foreign keys
  └── Sign-off on data parity
        │
        ▼
[ STAGE F: Production Cutover ]
  ├── Maintenance window (brief 5-minute read-only freeze)
  ├── Drain remaining outbox messages to PostgreSQL
  └── Switch Express primary database connection to PostgreSQL (Prisma)
        │
        ▼
[ STAGE G: Standby Rollback Window (14 Days) ]
  ├── PostgreSQL is primary for all reads and writes
  └── MongoDB kept read-only as an immutable point-in-time disaster archive
```

---

## 4. Dual-Write Failure Handling & Idempotency
During Stage D:
1. **Outbox Pattern**: Mutation endpoints write to MongoDB and record an event payload in an Outbox collection within the same transaction.
2. **Worker Synchronization**: A BullMQ worker consumes outbox events and executes the corresponding Prisma write.
3. **Idempotency**: All PostgreSQL writes use `upsert` keyed on the deterministic UUIDv5, preventing duplicate record creation on worker retries.
4. **Failure Alerting**: If a synchronization event fails after 5 retries, it is placed in a dead-letter queue (DLQ) with an immediate administrator alert.
