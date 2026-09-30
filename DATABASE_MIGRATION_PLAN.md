# MEDIID Database Migration Plan: MongoDB to PostgreSQL

## 1. Migration Strategy & Core Requirements

The database migration from MongoDB to PostgreSQL must occur with **zero data loss**, **preserved API contracts for the frontend**, and an **unbroken audit trail**.

### Key Rules:
1. **Preserve User-Facing Identifiers**: The public `uid` strings (`MID-XXXXXXXX`, `HID-XXXXXXXX`, `HID-...-DOC-0001`) must remain identical before and after migration. QR codes and SMS confirmation links must not break.
2. **Deterministic Primary Key Mapping**: Every 24-character hexadecimal MongoDB `ObjectId` must be converted to a deterministic UUID or mapped via a persistent migration lookup table.
3. **Array Normalization**: All denormalized arrays in `Patient.js` (`documents`, `bills`, `medicalBenefits`, `medicalHistory`) and `Appointment.js` must be extracted into their respective normalized relational tables.
4. **Zero Frontend Disruption**: During transitional phases, endpoints accept and return identical JSON shapes even if backed by PostgreSQL joins.

---

## 2. Primary ID Strategy: UUIDv7 vs UUIDv4 vs BIGINT

### Recommendation: **UUIDv7 (or UUIDv4 with deterministic ObjectId mapping)**

| Identifier Type | Distributed Friendly | API Exposure Safety | Indexing & B-Tree Locality | Long-Term Scalability | Decision |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BIGINT Identity** | ❌ Requires central sequence | ❌ Vulnerable to enumeration attacks | ⭐ Excellent (Sequential) | ⚠️ Sequence exhaustion / sharding friction | Not recommended for healthcare APIs |
| **UUIDv4** | ⭐ Fully distributed | ⭐ Opaque & secure | ❌ Poor cache locality (Random insertion) | ⭐ Infinite space | Acceptable, but causes index fragmentation |
| **UUIDv7** | ⭐ Fully distributed | ⭐ Opaque & secure | ⭐ Time-ordered prefix (Great index performance) | ⭐ Infinite space | **RECOMMENDED FOR ALL NEW TABLES** |

### MongoDB ObjectId to UUID Mapping Strategy
To migrate existing MongoDB collections into PostgreSQL without breaking foreign key references:
- A MongoDB `ObjectId` consists of 12 bytes (24 hex characters):
  `[ 4 bytes timestamp | 5 bytes random | 3 bytes counter ]`
- In PostgreSQL, UUID is 16 bytes (32 hex characters).
- We generate a deterministic UUIDv5 (namespaced SHA-1) using a fixed MEDIID namespace:
  $$\text{UUID} = \text{uuidv5}(\text{objectId.toString()}, \text{MEDIID\_NAMESPACE})$$
- This ensures that re-running the migration script produces the exact same primary and foreign keys every single time without requiring stateful ID translation lookups.

---

## 3. Data Transformation & Normalization Map

### 1. `users` Table
| MongoDB Field (`User`) | PostgreSQL Field (`users`) | Transformation Logic |
| :--- | :--- | :--- |
| `_id` | `id` | `uuidv5(user._id.toString())` |
| `email` | `email` | Lowercased, trimmed string |
| `uid` | `uid` | String (used by doctors/patients) |
| `password` | `password_hash` | Raw bcrypt hash transferred verbatim |
| `role` | `role` | Transferred verbatim |
| `isActive` | `is_active` | Boolean |
| `resetPasswordToken` | `reset_password_token` | String |
| `resetPasswordExpire` | `reset_password_expires_at` | Timestamp with timezone |
| `lastLogin` | `last_login_at` | Timestamp with timezone |
| `createdAt` | `created_at` | Timestamp with timezone |

### 2. `patients` & Relational Decomposition
A single document in `Patient` maps into 6 PostgreSQL tables:

```
MongoDB Patient Document
  ├── Root Document            ──> patients table (demographics, emergency, address)
  ├── patient.documents[]      ──> medical_documents table
  ├── patient.bills[]          ──> billing_records table
  ├── patient.medicalBenefits[]──> patient_benefits table
  ├── patient.medicalHistory[] ──> encounters + clinical_notes + conditions tables
  └── patient.trustedDoctors[] ──> patient_trusted_providers table
```

#### Field Extraction: `Patient.medicalHistory` -> `encounters` & `conditions`
```javascript
// Transform embedded medical history into longitudinal encounter
for (const entry of patient.medicalHistory) {
  const encounterId = uuidv5(`${patient._id}_history_${entry.date}`, NAMESPACE);
  
  // 1. Insert Encounter
  await db.insert('encounters').values({
    id: encounterId,
    patient_id: patientUuid,
    encounter_type: 'ambulatory',
    status: 'completed',
    start_time: entry.date || new Date(),
    chief_complaint: entry.diagnosis
  });

  // 2. Insert Clinical Note
  await db.insert('clinical_notes').values({
    id: uuidv5(`${encounterId}_note`, NAMESPACE),
    encounter_id: encounterId,
    author_id: systemAdminUserId,
    note_type: 'consultation',
    assessment: entry.treatment,
    plan: entry.notes
  });

  // 3. Insert Diagnosed Condition
  if (entry.diagnosis) {
    await db.insert('conditions').values({
      id: uuidv5(`${encounterId}_condition`, NAMESPACE),
      patient_id: patientUuid,
      encounter_id: encounterId,
      display_name: entry.diagnosis,
      clinical_status: 'resolved',
      diagnosed_date: entry.date
    });
  }
}
```

### 3. `appointments` Normalization
| MongoDB Field (`Appointment`) | PostgreSQL Field (`appointments`) | Transformation |
| :--- | :--- | :--- |
| `_id` | `id` | `uuidv5(apt._id.toString())` |
| `patient` | `patient_id` | `uuidv5(apt.patient.toString())` |
| `doctor` | `doctor_id` | `uuidv5(apt.doctor.toString())` |
| `hospital` | `hospital_id` | `uuidv5(apt.hospital.toString())` |
| `status` | `status` | Normalized to lowercase (`'CONFIRMED'` -> `'confirmed'`) |
| `confirmToken` | `confirm_token` | Parsed to UUID |
| `prescription` | Extracted | Inserted into `prescriptions` + `prescription_items` |

---

## 4. Execution Sequence (Step-by-Step)

```
Step 1: PostgreSQL Infrastructure Provisioning
  │
Step 2: Execute DDL & Migrations (Create all tables, enums, triggers)
  │
Step 3: Run Deterministic Extraction Script (Read MongoDB collections)
  │       ├── 1. Users
  │       ├── 2. Hospitals & Pharmacies
  │       ├── 3. Doctors & DoctorSlots
  │       ├── 4. Hospital Memberships (Staff)
  │       ├── 5. Patients & Emergency Contacts
  │       ├── 6. Normalized Patient Sub-entities (Benefits, Documents, Bills)
  │       ├── 7. Appointments & ConsultationSessions
  │       ├── 8. Longitudinal Encounters, Vitals, Conditions, Prescriptions
  │       └── 9. Marketplace Entities (Buyers, Requirements, Submissions, Messages)
  │
Step 4: Post-Migration Row Count & Checksum Verification
  │
Step 5: Dual-Read Shadow Mode (Verify query compatibility in Node.js)
  │
Step 6: Switch Primary Reads & Writes to PostgreSQL
  │
Step 7: Retain MongoDB in Read-Only Mode for 14-day Rollback Window
```

---

## 5. Post-Migration Verification & Rollback Strategy

### Checksum & Verification Script
A dedicated test runner runs post-migration queries to verify:
1. `COUNT(users.id)` in PostgreSQL matches `db.users.countDocuments()` in MongoDB.
2. `COUNT(patients.id)` matches `db.patients.countDocuments()`.
3. Total sum of `patient.bills.amount` matches `SUM(billing_records.amount)`.
4. Doctor login via bcrypt hash verification completes with existing passwords.
5. All public UIDs match 100%.

### Rollback Strategy
1. **MongoDB is NOT deleted or mutated during Phase 2**.
2. Both databases can run with a feature flag: `USE_POSTGRES=true/false`.
3. If critical defects emerge in PostgreSQL during initial rollout:
   - Toggle `USE_POSTGRES=false` in `.env`.
   - Node Express immediately directs traffic back to Mongoose without requiring frontend updates or redeployments.
