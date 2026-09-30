# MEDIID Phase 2 Ordered Implementation Plan (Frozen)

This implementation plan details the sequential tasks for the Phase 2 implementation. Each task is self-contained, testable, and gated by explicit verification requirements before proceeding.

---

## Verification Pipeline (Gating Criteria for Every Step)
No step is marked complete until it passes the following 5-point verification pipeline:
```
1. Implement (Write code / TypeScript module / Prisma migration)
   ↓
2. Unit Tests (Verify pure domain logic and validation schemas)
   ↓
3. Integration Tests (Verify database transactions and relation integrity)
   ↓
4. API Contract Verification (Verify legacy JSON responses match React frontend expectations)
   ↓
5. Data Integrity Verification (Verify constraints, foreign keys, and indexes)
   ↓
Proceed to next step
```

---

## Phase 2.1: PostgreSQL, Prisma & TypeScript Infrastructure Setup
- **Objective**: Establish the core PostgreSQL connection pool, Prisma client singleton, and incremental TypeScript build environment.
- **Tasks**:
  1. Add dependencies: `@prisma/client`, `prisma`, `pg`, `uuid`, `uuidv7`, `typescript`, `@types/node`, `@types/express`.
  2. Configure `tsconfig.json` with `allowJs: true` to support incremental TypeScript adoption alongside existing CommonJS files.
  3. Initialize Prisma configuration (`prisma/schema.prisma`) and run initial test migration against local/development PostgreSQL.
  4. Implement `src/config/database.ts` with graceful connection handling and lifecycle hooks.
- **Verification Gate**:
  - `npx prisma validate` passes with zero errors.
  - Automated health check query executes `SELECT 1` via Prisma.

---

## Phase 2.2: User Identity & Authentication Module
- **Objective**: Migrate the `users` table and implement the modular `auth` domain in TypeScript.
- **Tasks**:
  1. Implement `src/modules/auth/auth.repository.ts` and `src/modules/auth/auth.service.ts` using Prisma.
  2. Implement `POST /api/auth/register` supporting `patient`, `hospital_admin`, `doctor`, and `buyer`.
  3. Implement `POST /api/auth/login` with bcrypt verification and JWT generation.
  4. Implement `POST /api/auth/doctor-activate` for doctor account setup via hierarchical UID.
  5. Implement `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` (OTP flows).
- **Verification Gate**:
  - Unit test password hashing and JWT issuance.
  - Integration test login with existing seed credentials.
  - Verify response shape matches `{ token, user: { id, email, role }, profile }`.

---

## Phase 2.3: Healthcare Organizations & Practitioner Hierarchy
- **Objective**: Implement hospitals, private clinic doctors, staff roster, and doctor availability slots.
- **Tasks**:
  1. Implement `hospitals` module with atomic sequence counters for `doctorSequence` and `staffSequence`.
  2. Implement `doctors` module supporting both hospital-affiliated and independent private clinic doctors (`isPrivatePractice = true`).
  3. Implement `doctor_hospital_memberships` table for multi-hospital affiliations.
  4. Implement `hospital_memberships` (staff) module and recruitment endpoints.
  5. Implement `doctor_slots` module supporting one-off dates and weekly recurring schedules.
- **Verification Gate**:
  - Hospital recruitment triggers generation of hierarchical UIDs (`HID-XXXXXXXX-DOC-0001`).
  - Public search `/api/doctors` and `/api/hospitals` returns weighted rating scores correctly.
  - Slot availability endpoint `/api/doctor-portal/slots/available` accurately calculates booked vs remaining capacity.

---

## Phase 2.4: Patient Longitudinal Demographics & Benefits
- **Objective**: Implement patient profile, emergency card, benefits, and trusted provider relationships.
- **Tasks**:
  1. Implement `patients` module with `generatePatientUID()` generator (`MID-XXXXXXXX`).
  2. Implement `patient_benefits` module handling government, employer, and personal insurance policies.
  3. Implement `toLegacyPatientDTO` presentation adapter in `src/shared/mappers/patient.mapper.ts`.
  4. Wire `GET /api/patients/profile`, `PUT /api/patients/profile`, and public emergency scan `GET /api/patients/scan/:uid`.
- **Verification Gate**:
  - Emergency card returns exact required blood group and contact details.
  - `GET /api/patients/profile` returns legacy nested structure (`medicalBenefits`, `documents`, `bills`, `medicalHistory`).

---

## Phase 2.5: Appointments, Consultation Windows & Scheduler
- **Objective**: Implement appointment booking, SMS confirmation links, consultation access sessions, and background reminders.
- **Tasks**:
  1. Implement `appointments` module (`POST /api/appointments`, `GET /api/appointments/my`, `GET /api/appointments/hospital`).
  2. Implement SMS confirmation endpoint `GET /api/appointments/confirm/:token` creating an active `consultation_sessions` record.
  3. Connect BullMQ/Redis scheduler to poll and update expired appointments and consultation windows.
- **Verification Gate**:
  - Tapping confirm link activates consultation session valid from (Appointment Start - 10min) to (+2 hours).
  - Status transitions (`pending` -> `confirmed` -> `completed`) execute atomically.

---

## Phase 2.6: Encounter-Centered Longitudinal Clinical Records
- **Objective**: Migrate medical history into longitudinal encounters, SOAP notes, vitals, conditions, and prescriptions.
- **Tasks**:
  1. Implement `encounters` module linking appointments to clinical care visits.
  2. Implement `vitals`, `clinical_notes`, and `conditions` recording.
  3. Implement `prescriptions` and `prescription_items` schema and endpoints.
  4. Implement `doctorPortal.ts` queue and patient EHR access guard checking active consultation sessions.
- **Verification Gate**:
  - Doctor with active session can fetch patient profile and submit prescriptions.
  - Doctor without active session receives HTTP 403 with detailed reason.
  - Prescriptions issue structured items that sync to the patient's medical history.

---

## Phase 2.7: Hospital Pharmacy & Dispensing Workbench
- **Objective**: Implement hospital pharmacy lookup, medication checkout, and inventory decrement.
- **Tasks**:
  1. Implement `pharmacies` module linking pharmacy users to hospitals.
  2. Implement `GET /api/pharmacy-portal/prescription/:uid` filtering prescriptions from the current hospital.
  3. Implement `POST /api/pharmacy-portal/dispense` recording `pharmacy_dispenses` and auto-generating a paid bill.
- **Verification Gate**:
  - Pharmacist can dispense medications against prescriptions.
  - Dispensing records append a note to the clinical record and generate an invoice.

---

## Phase 2.8: Unified Invoicing & Financial Records
- **Objective**: Consolidate consultation fees, pharmacy bills, and custom diagnostic expenses into `billing_records`.
- **Tasks**:
  1. Implement `billing` module managing `billing_records`.
  2. Wire `GET /api/patients/bills` unifying appointment fee records and custom lab bills.
  3. Implement `PUT /api/patients/bills/:billId/pay` with transaction-safe payment confirmation.
- **Verification Gate**:
  - Unified bills list displays all patient expenses sorted chronologically.
  - Payment updates bill status and records payment method and timestamp.

---

## Phase 2.9: Air-Gapped Research Data Marketplace
- **Objective**: Migrate secondary MongoDB marketplace collections into isolated PostgreSQL tables.
- **Tasks**:
  1. Implement `buyers`, `research_requirements`, `dataset_submissions`, and `submission_documents`.
  2. Implement `marketplace_messages` and Socket.IO real-time event broadcasting.
  3. Wire buyer dashboard and requirement creation routes.
- **Verification Gate**:
  - Buyers cannot access unsubmitted patient records.
  - Real-time chat messages persist to `marketplace_messages` with unread counts.

---

## Phase 2.10: Migration Script & Deterministic Data Backfill
- **Objective**: Execute historical backfill from MongoDB to PostgreSQL using UUIDv5.
- **Tasks**:
  1. Implement `scripts/migrate-mongo-to-postgres.ts`.
  2. Map all MongoDB ObjectIds to PostgreSQL UUIDs via `uuidv5(objectId, MEDIID_NAMESPACE)`.
  3. Decompose and normalize `Patient` documents into `patients`, `patient_benefits`, `medical_documents`, `encounters`, and `conditions`.
  4. Run automated checksums comparing MongoDB document counts against PostgreSQL row counts.
- **Verification Gate**:
  - 100% of Users, Patients, Hospitals, Doctors, Appointments, and Marketplace records migrated.
  - Zero broken foreign-key constraints.

---

## Phase 2.11: Dual-Write Outbox Synchronization & Production Cutover
- **Objective**: Run live shadow dual-writes, verify data parity, and execute final cutover.
- **Tasks**:
  1. Implement transactional Outbox pattern in mutation routes.
  2. Run BullMQ worker synchronizing writes to PostgreSQL.
  3. Perform read-shadowing to verify identical API responses.
  4. Execute final cutover, switching primary database connection to PostgreSQL.
  5. Retain MongoDB in read-only standby mode for 14-day rollback window.
- **Verification Gate**:
  - Zero data divergence detected over 48 hours of shadow execution.
  - Flawless switchover with zero frontend downtime.
