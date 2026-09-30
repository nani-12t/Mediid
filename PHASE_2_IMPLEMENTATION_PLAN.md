# MEDIID Phase 2 Ordered Implementation Plan

This implementation plan breaks the entire migration into bite-sized, independently testable tasks. No step alters frontend contracts or destroys legacy databases.

---

## Phase 2.1: PostgreSQL & Modern ORM Infrastructure Setup
- **Goal**: Establish the PostgreSQL connection pool, migration framework, and ORM schemas.
- **Tasks**:
  1. Add PostgreSQL dependencies (`pg`, chosen ORM `drizzle-orm` / `prisma`, `dotenv`).
  2. Configure connection pooling and SSL options in `src/config/database.js`.
  3. Define SQL migration pipeline (or Drizzle Kit / Prisma Migrate).
  4. Write automated health check query to ensure PostgreSQL connection vitality.

---

## Phase 2.2: User & Authentication Identity Module
- **Goal**: Migrate the base `users` table and decouple auth logic into a clean module.
- **Tasks**:
  1. Create schema definition for `users`.
  2. Implement `auth.repository.js` and `auth.service.js`.
  3. Support dual-read password authentication (verify against PostgreSQL, fallback to Mongo if not yet migrated).
  4. Write unit tests for JWT issuance, role checking, and password hashing.

---

## Phase 2.3: Organization, Hospital & Practitioner Hierarchy
- **Goal**: Implement hospitals, doctors, staff, and slots in PostgreSQL.
- **Tasks**:
  1. Define DDL and ORM schemas for `hospitals`, `doctors`, `doctor_slots`, `hospital_memberships`, and `pharmacies`.
  2. Implement atomic sequence generation for hierarchical UIDs (`doctorSequence`, `staffSequence`).
  3. Migrate `/api/hospitals`, `/api/doctors`, and `/api/staff` to read/write from PostgreSQL.
  4. Validate doctor slot search endpoint `/api/doctor-portal/slots/available`.

---

## Phase 2.4: Patient Demographics & Profile Management
- **Goal**: Implement `patients` table and normalize benefits and documents.
- **Tasks**:
  1. Define DDL for `patients`, `patient_benefits`, and `medical_documents`.
  2. Implement `patient.mapper.js` DTO adapter to return the exact nested JSON structure expected by `frontend/src/pages/patient/Profile.jsx`.
  3. Implement CRUD operations for patient benefits and document metadata.
  4. Test public emergency QR scan endpoint `/api/patients/scan/:uid`.

---

## Phase 2.5: Appointments, Consultation Sessions & Notification Queues
- **Goal**: Migrate appointment scheduling, time-slots, and SMS confirmation links.
- **Tasks**:
  1. Define DDL for `appointments` and `consultation_sessions`.
  2. Migrate `/api/appointments` booking flow and Twilio dispatch logic.
  3. Migrate `/api/appointments/confirm/:token` to activate sessions in PostgreSQL.
  4. Connect BullMQ/Redis scheduler to poll and update expired appointments.

---

## Phase 2.6: Longitudinal EHR & Clinical Workbench
- **Goal**: Decompose medical history into encounters, vitals, clinical notes, and prescriptions.
- **Tasks**:
  1. Create tables for `encounters`, `vitals`, `clinical_notes`, `conditions`, `allergies`, `prescriptions`, and `prescription_items`.
  2. Update `/api/doctor-portal/queue` and `/api/doctor-portal/patient/:uid` to pull from relational clinical tables.
  3. Implement `/api/doctor-portal/prescription` to insert atomic rows into `prescriptions` and `prescription_items`.
  4. Implement `/api/pharmacy-portal/dispense` to read prescriptions and record dispensation.

---

## Phase 2.7: Unified Billing & Financial Invoicing
- **Goal**: Unify appointment fees, diagnostic bills, and pharmacy checkout into `billing_records`.
- **Tasks**:
  1. Create `billing_records` table with status tracking (`pending`, `paid`, `insurance_claimed`).
  2. Wire `/api/patients/bills` to return unified invoices from both appointments and custom bills.
  3. Support `/api/patients/bills/:billId/pay` with transaction-safe payment confirmation.

---

## Phase 2.8: Data Marketplace & Research Portal
- **Goal**: Migrate secondary MongoDB marketplace collections into primary PostgreSQL schema.
- **Tasks**:
  1. Create tables for `buyers`, `research_requirements`, `dataset_submissions`, and `marketplace_messages`.
  2. Implement marketplace routes (`/api/marketplace/*`).
  3. Wire WebSocket/Socket.IO message relays to persist chat into `marketplace_messages`.

---

## Phase 2.9: Data Extraction & Deterministic Migration Runner
- **Goal**: Extract all historical MongoDB data, normalize, and load into PostgreSQL.
- **Tasks**:
  1. Write idempotent migration script (`scripts/migrate-mongo-to-postgres.js`).
  2. Execute deterministic UUIDv5 transformation for all ObjectIds.
  3. Run comprehensive data integrity, foreign key constraint, and checksum verifications.

---

## Phase 2.10: Shadow Execution & Production Cutover
- **Goal**: Verify live production workload and switch traffic.
- **Tasks**:
  1. Enable Dual-Write / Shadow-Read mode in staging environment.
  2. Monitor performance, latency, and index efficiency.
  3. Flip primary switch to PostgreSQL.
  4. Retain MongoDB in read-only standby mode for 14-day rollback safety window.
