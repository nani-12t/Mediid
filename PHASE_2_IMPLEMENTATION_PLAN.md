# MEDIID Phase 2 Ordered Implementation Plan (Frozen)

This implementation plan details the sequential tasks for the Phase 2 implementation. Each task is self-contained, testable, and gated by explicit verification requirements before proceeding.

---

## Phase 1.2: Final Schema Hardening (COMPLETE — 2026-10-06)

Phase 1.2 was executed and verified before Phase 2 implementation. The following decisions were frozen:

### 1. Organizational Context Invariant (ADR-013)
- Every `Appointment.hospitalId` is `NOT NULL`. Private clinics are represented as `Hospital` records with `type = clinic`.
- `DoctorSlot.hospitalId` is **intentionally nullable** — slot templates are practitioner-level; org context is enforced at the Appointment level.
- `Hospital.type` enum: `government | private | trust | clinic`.
- Documented in: `ARCHITECTURE_DECISIONS.md` (ADR-013), `TARGET_ARCHITECTURE.md` §3.

### 2. Clinical Consent Isolation
- `Consent` model covers **clinical healthcare access only**: `granteeType` ∈ `{ doctor, hospital, clinic }`.
- Research marketplace authorization uses a completely separate chain: `DatasetConsent → ApprovedDataset → DatasetAccessGrant → DatasetAccessLog`.
- The `researcher` grantee type was **removed** from the clinical consent model.
- Documented in: `ARCHITECTURE_DECISIONS.md` (ADR-009).

### 3. MEDIID Migration Namespace (FROZEN)
```
MEDIID_MIGRATION_NAMESPACE = 57c0c744-9cdc-41f9-a532-7e60be63d87f
```
This value MUST NOT change after Phase 2.1 begins. It is recorded in both `ARCHITECTURE_DECISIONS.md` and `DATABASE_MIGRATION_PLAN.md`.

### 4. Relational Integrity Fixes
- `DatasetAccessLog.datasetId` → added explicit Prisma relation to `ApprovedDataset` (onDelete: Restrict).
- `DatasetAccessLog.buyerId` → added explicit Prisma relation to `Buyer` (onDelete: Restrict).
- `ApprovedDataset.accessLogs` back-relation added.
- `Buyer.datasetAccessLogs` back-relation added.
- All other relations (`BillingRecord → Appointment`, `Notification → Appointment`, `DatasetSubmission → Patient`, `DatasetConsent` chain) already had proper Prisma relations — confirmed correct.

### 5. Prisma Validation
- Runtime `prisma format` and `prisma validate` are **deferred to Phase 2.1** (PostgreSQL infrastructure not provisioned in Phase 1.2).
- Static relational inspection confirmed: all FK scalar fields have corresponding Prisma relation declarations.
- Schema version marked in `schema.prisma` header: `Phase 1.2 — Final Schema Hardening (2026-09-30)`.

### Files Modified
- `backend/prisma/schema.prisma` — Header version marker; `DatasetAccessLog` FK relations; `ApprovedDataset` and `Buyer` back-relations.
- `ARCHITECTURE_DECISIONS.md` — ADR-005 and ADR-013 (already present, confirmed frozen).
- `DATABASE_MIGRATION_PLAN.md` — Namespace frozen, §2.5 marketplace isolation models documented.
- `TARGET_ARCHITECTURE.md` — Org context invariant, marketplace chain documented.
- `PHASE_2_IMPLEMENTATION_PLAN.md` — This completion record.

---

## Phase 1.3: Final Appointment Architecture Freeze (COMPLETE — 2026-10-09)

Phase 1.3 finalizes the appointment domain architecture freeze before Phase 2 runtime execution:

### 1. Separate Scheduling Domains (Hospital vs. Private Clinic)
- `HospitalAppointment`: Front-desk managed, hospital organization bound. Confirmation modes: `DEPOSIT`, `TIME_BASED`, `MANUAL`.
- `PrivateClinicAppointment`: Strictly **Doctor-Owned** practice. **NO receptionist or front-desk role/portal**. Online booking enforces mandatory 50% deposit.
- Both domains link to shared `Encounter` longitudinal records (`hospitalAppointmentId`, `privateClinicAppointmentId`), while encounters can also be created without appointments.

### 2. Materialized Appointment Slots
- `MaterializedAppointmentSlot` rows pre-generated with `ONLINE`, `OFFLINE`, and `FLEXIBLE` channels.
- `@@unique([doctorId, slotStart])` prevents double booking the same practitioner across hospital and clinic contexts.
- Recurring patterns (`RecurringAvailabilityTemplate`) and calendar blocks (`ScheduleOverride`) materialize into concrete slot records.
- Reopening mechanism: Cancelled or expired reservations automatically reset to `AVAILABLE` with incremented `reopenedCount`.

### 3. Dynamic Payment Deadlines & Fast-Confirm Window
- Payment hold deadline: $\min(60\text{ min},\; \text{slotStart} - 10\text{ min})$.
- Safety cutoff: Online booking closes 10 minutes prior to slot start time.
- Fast-confirm window: 5 minutes when lead time is between 10 and 15 minutes before slot start.
- Boundary condition: If computed hold window $\le 0$, transaction aborts immediately (never create expired/zero-duration holds).
- Offline / walk-in bookings do not require online payment holds.

### 4. Configurable Provider Policies, Refunds & Audit
- Provider-initiated cancellations guarantee a 100% full refund or agreed transfer credit (`TRANSFER_CREDIT_OFFERED`).
- Original payment history preserved without mutation; refunds tracked via `refundStatus`, `refundAmount`, `refundTransactionRef`.
- `support_agent` role added: Can perform `SUPPORT_ASSISTED` bookings with full audit trail (`bookedByUserId`). Support agents cannot bypass provider policies or view clinical EHR notes/vitals.

### Files Modified
- `backend/prisma/schema.prisma` — Schema version 1.3; added `support_agent` UserRole; added `HospitalSchedulingRule`, `DoctorClinicPolicy`, `RecurringAvailabilityTemplate`, `ScheduleOverride`, `MaterializedAppointmentSlot`, `HospitalAppointment`, and `PrivateClinicAppointment` with full relations.
- `ARCHITECTURE_DECISIONS.md` — Added ADR-014, ADR-015, ADR-016, and ADR-017.
- `TARGET_ARCHITECTURE.md` — Added Section 8 detailing domain split, materialized slot locking, payment deadlines, and audit models.
- `DATABASE_MIGRATION_PLAN.md` — Added Section 2.6 mapping new scheduling models.
- `API_COMPATIBILITY.md` — Updated appointment compatibility adapter mappings for both scheduling domains.
- `PHASE_2_IMPLEMENTATION_PLAN.md` — Added Phase 1.3 completion record and updated Phase 2.5 scope.

---

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
  3. **Clinic Organization Creation Flow**: Implement `POST /api/hospitals` supporting `type = clinic` to allow private-practice doctors to register a clinic organization record. Every appointment must reference a `Hospital` record (including clinics). See ADR-013.
  4. Implement `doctor_hospital_memberships` table for multi-hospital affiliations.
  5. Implement `hospital_memberships` (staff) module and recruitment endpoints.
  6. Implement `doctor_slots` module supporting one-off dates and weekly recurring schedules. Note: `DoctorSlot.hospitalId` is nullable by design; the org context is enforced at the `Appointment` level.
- **Verification Gate**:
  - Hospital recruitment triggers generation of hierarchical UIDs (`HID-XXXXXXXX-DOC-0001`).
  - Public search `/api/doctors` and `/api/hospitals` returns weighted rating scores correctly.
  - Slot availability endpoint `/api/doctor-portal/slots/available` accurately calculates booked vs remaining capacity.
  - `POST /api/appointments` rejects any request where `hospitalId` does not resolve to an existing Hospital record.

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
- **Objective**: Migrate secondary MongoDB marketplace collections into isolated PostgreSQL tables and implement the full Phase 1.2 dataset consent and access control chain.
- **Tasks**:
  1. Implement `buyers`, `research_requirements`, `dataset_submissions`, and `submission_documents`.
  2. Implement `marketplace_messages` and Socket.IO real-time event broadcasting.
  3. Wire buyer dashboard and requirement creation routes.
  4. Implement `DatasetConsent` module: patient consent per research requirement with scopes, validity window, and revocation endpoint (`POST /api/marketplace/consents`, `DELETE /api/marketplace/consents/:id`).
  5. Implement `ApprovedDataset` module: admin/review endpoint to approve de-identified dataset submissions, triggering de-identification pipeline (initial stub in Phase 2.9, full implementation in later AI phase).
  6. Implement `DatasetAccessGrant` module: grant time-bounded access to buyers upon dataset approval (`POST /api/marketplace/datasets/:id/grants`).
  7. Implement `DatasetAccessLog` module: record every buyer access action in append-only `dataset_access_logs`; expose audit trail to platform admin.
  8. Enforce middleware: buyer-role JWT tokens MUST NOT be accepted by any clinical EHR endpoint.
- **Verification Gate**:
  - Buyers cannot access unsubmitted patient records.
  - Buyers cannot access `patients`, `encounters`, `prescriptions`, or any clinical EHR endpoint.
  - Real-time chat messages persist to `marketplace_messages` with unread counts.
  - Dataset consent can be revoked by the patient at any time, immediately invalidating related `DatasetAccessGrant` records.
  - `DatasetAccessLog` records are created on every buyer access and cannot be deleted via API.

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
