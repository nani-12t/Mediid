# MEDIID Target Architecture & PostgreSQL Design (Frozen)

## 1. Architectural Principles & Technology Decisions

MEDIID is evolving into an integrated Hospital Information Management System (HIMS) and longitudinal EHR platform. The technology stack is frozen for Phase 2:

- **Frontend**: React 18 SPA (unchanged during migration, backward-compatible API contracts).
- **Core Backend API**: Node.js + Express.js configured as a **Modular Monolith**.
- **Language**: TypeScript for all new/refactored modules, coexisting with existing JavaScript (`allowJs: true`).
- **Primary Database**: **PostgreSQL** (version 15+).
- **ORM**: **Prisma** exclusively.
- **Cache & Async Queues**: Redis + BullMQ for background job scheduling (SMS reminders, de-identification, periodic cleanup).
- **AI Service Boundary**: Standalone Python FastAPI microservice (planned for future phases only; strictly excluded from Phase 2).
- **Vector Storage**: PostgreSQL with `pgvector` extension.

---

## 2. Target Directory Structure

```
backend/
├── prisma/
│   └── schema.prisma                   # Single source of truth for PostgreSQL relational models
│
├── src/
│   ├── app.ts                          # Express application pipeline
│   ├── server.ts                       # HTTP server, Socket.IO & graceful shutdown
│   │
│   ├── config/
│   │   ├── env.ts                      # Validated environment configuration
│   │   ├── database.ts                 # PrismaClient singleton instance
│   │   └── redis.ts                    # Redis client & BullMQ connection
│   │
│   ├── middleware/
│   │   ├── authenticate.ts             # JWT extraction and user session hydration
│   │   ├── authorize.ts                # Role-based access control
│   │   ├── contextAccessGuard.ts       # Contextual consent, appointment window, and break-glass validator
│   │   ├── validateRequest.ts          # Request schema validation
│   │   └── errorHandler.ts             # Centralized operational error mapping
│   │
│   ├── modules/                        # Domain feature modules (Modular Monolith)
│   │   ├── auth/                       # Login, register, doctor activation, password reset
│   │   ├── users/                      # User lifecycle and status
│   │   ├── patients/                   # Patient demographics, emergency card, benefits
│   │   ├── doctors/                    # Practitioner credentials, slots, practice memberships
│   │   ├── hospitals/                  # Hospital admin, departments, staff memberships
│   │   ├── appointments/               # Scheduling, status transitions, SMS tokens
│   │   ├── encounters/                 # Longitudinal clinical visits and episodes of care
│   │   ├── ehr/                        # Vitals, clinical notes, conditions, allergies
│   │   ├── prescriptions/              # Medication orders, items, dispensing tracking
│   │   ├── diagnostics/                # Lab test orders, results, imaging studies
│   │   ├── documents/                  # Medical document storage references and metadata
│   │   ├── pharmacy/                   # Hospital dispensing queues and checkout
│   │   ├── billing/                    # Invoices, fee schedules, payments
│   │   ├── messaging/                  # Real-time WebSockets & direct messaging
│   │   ├── notifications/              # Twilio SMS / WhatsApp / Email queues
│   │   ├── consent/                    # Patient access grants, consents, break-glass
│   │   ├── audit/                      # Immutable access logs
│   │   └── marketplace/                # Air-gapped research requirements, submissions, payouts
│   │
│   ├── shared/                         # DTO mappers, presentation adapters, domain events
│   │   ├── mappers/
│   │   └── errors/
│   │
│   └── utils/
│       ├── idGenerator.ts              # MID, HID, hierarchical UID generation
│       └── uuid.ts                     # UUIDv5 (migration) and UUIDv7 (application) generators
│
├── tests/
├── scripts/                            # Migration backfill and shadow-read verification scripts
├── tsconfig.json                       # Incremental TypeScript compiler configuration
└── package.json
```

---

## 3. Practitioner & Multi-Hospital Architecture

In the original MongoDB schema, every doctor had a mandatory `hospital: ObjectId` field. In the real world, medical practitioners may practice across multiple institutions or operate an independent private clinic.

### The Decoupled Practitioner Model
1. **Practitioner Identity (`doctors`)**:
   - Stores practitioner qualifications, medical license number (`registrationNumber`), specialization, and bio.
   - `primaryHospitalId` is **nullable**. Independent private clinic doctors operate with `isPrivatePractice = true` and no hospital constraint.
2. **Practice Affiliations (`doctor_hospital_memberships`)**:
   - Many-to-Many join table linking `Doctor` to `Hospital`.
   - Supports affiliations with multiple hospitals simultaneously (e.g. Apollo on Mon/Wed, Fortis on Tue/Thu, Private Clinic on Fri).
   - Tracks `roleTitle` (e.g., "Visiting Consultant", "Head of Cardiology") and `isPrimary`.
3. **Backward Compatibility**:
   - For existing hospital-recruited doctors, `primaryHospitalId` is populated alongside an automatic entry in `doctor_hospital_memberships`.
   - The hierarchical UID format (`HID-XXXXXXXX-DOC-0001`) remains fully preserved for hospital-affiliated doctors, while independent doctors receive `DOC-XXXXXXXX`.

### Organizational Context Invariant (Phase 1.2)

> **Every Appointment MUST have a non-null `hospitalId` referencing a `Hospital` record.**

The `Hospital` model acts as the **Healthcare Organization** entity in MEDIID. Private clinics are represented as `Hospital` records with `type = clinic`. This means:

| Organization type | `Hospital.type` |
|---|---|
| Government hospital / PHC | `government` |
| Private multispecialty hospital | `private` |
| Charitable / trust hospital | `trust` |
| Private clinic (individual / group) | `clinic` |

**MEDIID does NOT rename `Hospital` to `Organization`** during Phase 2 to avoid migration complexity. The `type` field extends its semantics.

**`DoctorSlot.hospitalId` is intentionally nullable** at the slot-template level (the doctor defines general availability), but becomes non-null in the context of a booked `Appointment`. See ADR-013.

> **`Hospital` acts as the Healthcare Organization entity in MEDIID.**
> The model is NOT renamed to `Organization` in Phase 2 to avoid migration complexity.
> The `type` field extends its semantics: `government | private | trust | clinic`.
> Every `Hospital` record — whether a large multispeciality hospital or a single-doctor private clinic — represents an organizational context that anchors clinical appointments, encounters, and billing.

---

## 4. Longitudinal Clinical Care (Encounter-Centered Model)

An appointment is a business scheduling event. An encounter is the actual clinical care episode.

```
Patient
   │
   ├── Appointment (Booking, TimeSlot, Status, SMS Token)
   │      │
   │      └── realizes (optional 1:1)
   │             │
   └── Encounter (Clinical episode: Ambulatory, Emergency, Inpatient, Virtual)
          │
          ├── Vitals (BP, Pulse, Temp, SpO2, BMI)
          ├── Clinical Notes (SOAP notes: Subjective, Objective, Assessment, Plan)
          ├── Conditions / Diagnoses (ICD-10, Active/Resolved status)
          ├── Allergies (Substance, Reaction, Severity)
          ├── Prescriptions
          │      └── Prescription Items (Drug, Dosage, Frequency, Duration)
          │             └── Pharmacy Dispenses (Dispensations recorded by pharmacy)
          ├── Lab Orders ──> Lab Results
          ├── Imaging Orders ──> Imaging Studies
          └── Medical Documents (Uploads, Scans, Discharge summaries)
```

Historical records migrated from MongoDB's `patient.medicalHistory` array are represented as historical completed `encounters` with attached `clinical_notes` and `conditions`, ensuring a unified clinical timeline.

---

## 5. Security & Healthcare Access Model

Access to sensitive patient health information requires evaluating:
$$\text{Access Decision} = \text{Auth} \wedge \text{Role} \wedge \text{Org Boundary} \wedge (\text{Ownership} \vee \text{Clinical Context} \vee \text{Consent} \vee \text{Break-Glass})$$

### Components
1. **Clinical Context (Consultation Windows)**:
   - Doctors have automated access to a patient's EHR only during an active consultation window: from **10 minutes before the scheduled appointment start** until **2 hours after**.
   - Verified via `consultation_sessions` table.
2. **Explicit Patient Consent (`consents`)**:
   - Patients can grant time-limited access to specific doctors or hospitals with granular scopes (`vitals`, `prescriptions`, `documents`).
3. **Emergency Break-Glass (`break_glass_events`)**:
   - In life-threatening emergencies where no appointment exists, doctors can trigger "Break-Glass" access.
   - Requires entering a mandatory clinical justification reason.
   - Emits an immediate high-priority audit event logged in `break_glass_events` and notifies the hospital compliance officer.
4. **Immutable Audit Trail (`access_logs`)**:
   - Every read and write of patient clinical data records the requesting user, patient ID, resource, purpose of use, and whether the access was granted or denied.

---

## 6. Air-Gapped Data Marketplace Architecture

The research data marketplace is logically separated from the clinical care domain:
- **No Direct Clinical Queries**: Buyers/Researchers have zero permissions to query `patients`, `encounters`, or `prescriptions`.
- **Submission Boundary**: Patients voluntarily submit specific anonymized documents to a requirement via `dataset_submissions` and `submission_documents`.
- **Anonymization**: Submissions strip direct identifiers (name, phone, Aadhaar, address) before buyer inspection.
- **Controlled Messaging**: Chat between buyers and patients occurs strictly through `marketplace_messages` referenced to specific research requirements.

### Phase 1.2 — Dataset Consent & Access Control Chain

The full controlled access pipeline (introduced in Phase 1.2):

```
ResearchRequirement
        ↓
DatasetSubmission (patient voluntarily uploads specific documents)
        ↓
DatasetConsent (patient explicitly consents, time-bounded, scoped, revocable)
        ↓
De-identification pipeline (PII stripped — name, phone, Aadhaar, address)
        ↓
ApprovedDataset (versioned, de-identified snapshot stored at storage ref)
        ↓
DatasetAccessGrant (buyer receives time-bounded access authorization)
        ↓
Researcher accesses ApprovedDataset ONLY (never raw EHR tables)
        ↓
DatasetAccessLog (immutable audit: action, IP, user agent, timestamp)
```

**New isolation tables (Phase 1.2):**

| Table | Purpose |
|---|---|
| `dataset_consents` | Patient explicit consent per requirement, separate from clinical `consents` |
| `approved_datasets` | De-identified dataset snapshot (versioned) |
| `dataset_access_grants` | Time-bounded buyer access authorization |
| `dataset_access_logs` | Immutable audit trail (append-only, with direct FKs to `approved_datasets` and `buyers`) |

**Relational integrity (Phase 1.2 fix):** `dataset_access_logs` carries explicit Prisma FK relations on all three reference columns (`accessGrantId`, `datasetId`, `buyerId`). The `datasetId` → `approved_datasets` and `buyerId` → `buyers` relations eliminate disconnected UUID scalars and enforce FK constraints at the PostgreSQL level.

**Clinical `consents` table** is exclusively for healthcare grantees (`doctor`, `hospital`, `clinic`). The `researcher` grantee type has been removed from the clinical consent model.

---

## 7. AI Service Boundary (FastAPI Microservice)

The Node.js Express backend remains the single source of truth for client applications. The Python FastAPI service will be added in later phases as an internal worker service:

```
[ React SPA ] ──> HTTP/REST ──> [ Node.js Express Modular Monolith ]
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                   ▼
                [ PostgreSQL (Prisma) ]             [ Redis / BullMQ ]
                  - Relational EHR                    - Event queues
                  - pgvector embeddings               - Async jobs
                                                            │
                                                            ▼ (HTTP/Job trigger)
                                                [ Python FastAPI Service ]
                                                  - OCR (Document parsing)
                                                  - Clinical NLP / Entity Extraction
                                                  - RAG & Medical Assistant
```

---

## 8. Final Appointment Architecture Freeze (Phase 1.3)

### 8.1 Domain Split: Hospital vs. Private Clinic Scheduling
Scheduling is partitioned into two specialized domain models, both converging on the longitudinal `Encounter` / EHR platform:

1. **Hospital Scheduling (`hospital_appointments`)**:
   - **Governance**: Managed by Hospital Front Desk (`HospitalStaff` with role `receptionist` or `administrator`).
   - **Confirmation Modes**: Configured via `hospital_scheduling_rules` as `DEPOSIT`, `TIME_BASED` (auto-confirm if deposit hold completes), or `MANUAL` (front-desk staff review).
   - **Org Context**: `hospitalId` is mandatory (`NOT NULL`).

2. **Private Clinic Scheduling (`private_clinic_appointments`)**:
   - **Governance**: Strictly **Doctor-Owned**. No clinic receptionist role or portal exists. The doctor directly manages slots, appointments, and consultations.
   - **Mandatory 50% Consultation Deposit**: Online bookings enforce a 50% deposit requirement upfront before confirmation.
   - **Org Context**: `clinicHospitalId` is optional; independent practitioners can operate clinic practices without complex multi-bed hospital entities.

3. **Decoupled Longitudinal Encounters**:
   - Every `Encounter` maintains nullable FKs to both `HospitalAppointment` and `PrivateClinicAppointment`.
   - Direct encounters can be initialized without any pre-existing appointment (walk-in emergency or legacy chart ingestion).

### 8.2 Materialized Slots & Concurrency Protection
To eliminate race conditions and double bookings across multiple affiliated institutions:
- **`materialized_appointment_slots`**: Pre-generated slot rows representing exact calendar intervals with `ONLINE`, `OFFLINE`, and `FLEXIBLE` channels.
- **Cross-Facility Doctor Uniqueness**: Enforced via PostgreSQL unique constraint `@@unique([doctorId, slotStart])`. A doctor can never be booked simultaneously at a hospital and a private clinic.
- **Transactional Slot Reservation**:
  ```sql
  BEGIN;
  SELECT * FROM materialized_appointment_slots 
  WHERE id = :slotId AND state = 'AVAILABLE' 
  FOR UPDATE;
  
  UPDATE materialized_appointment_slots 
  SET state = 'HELD', hold_expires_at = :deadline, held_by_user_id = :userId, version = version + 1
  WHERE id = :slotId;
  COMMIT;
  ```
- **Slot Reopening**: Cancelled bookings or payment holds that expire release the slot back to `AVAILABLE`, resetting `holdExpiresAt = null` and incrementing `reopenedCount`.

### 8.3 Dynamic Payment Deadlines & Safety Cutoffs
Payment holds are dynamically calculated to prevent holds extending past appointment start times:
- **Standard Hold Window**: 60 minutes for advance bookings.
- **10-Minute Safety Cutoff**: Online booking closes exactly 10 minutes prior to `slotStart`.
- **Fast-Confirm Window**: When lead time is between 10 and 15 minutes before slot start, the payment hold is set to exactly 5 minutes:
  $$\text{holdDeadline} = \min(\text{now} + 60\text{m},\; \text{slotStart} - 10\text{m},\; \text{now} + 5\text{m for late-bookings})$$
- **Boundary Invariant**: If computed hold window $\le 0$, the reservation transaction aborts; zero-duration or expired holds are never created.
- **Offline / Walk-In**: In-person walk-ins and phone desk bookings bypass payment holds (`paymentHoldStatus = NONE`).

### 8.4 Configurable Cancellation, Refund History & Audit
- **Provider Policy Snapshots**: Booking transactions freeze a JSON snapshot (`policySnapshot`) capturing active refund and cancellation parameters at booking time.
- **Provider-Initiated Cancellations**: When cancelled by doctor or front desk, the patient receives a 100% full refund or mutually agreed transfer credit (`TRANSFER_CREDIT_OFFERED`).
- **Payment History Preservation**: Refund amounts and gateway references (`refundAmount`, `refundTransactionRef`) are appended to billing records without overwriting original payment transaction history.
- **SUPPORT_ASSISTED Bookings**: Support agents (`support_agent` role) can book appointments on behalf of patients (`bookingChannel = SUPPORT_ASSISTED`). Support agents cannot bypass provider cancellation/deposit rules and are strictly forbidden from viewing patient clinical EHR records (clinical notes, vitals, lab results).

## Phase 1.3.1 hardening amendment

The executable specification is backend/prisma/SQL_CONSTRAINTS.md and its committed migrations. Replace single-holder logic with AppointmentSlotReservation rows and shared cross-domain capacity. Active doctor intervals use GiST exclusion. AppointmentPayment and AppointmentRefund retain attempts, captures, partial refunds and audited history. Runtime PostgreSQL services/access guards are deferred; MongoDB routes remain primary.

Provider policies explicitly include 60/10/20/5/10-minute deadline defaults, configurable hospital confirmation lead of 40 minutes, 50 percent clinic online deposit, structured cancellation/rescheduling/no-show rules, and patient-approved transfers. Policy snapshots freeze booking terms. Operational bookings need matching slots and own reservations; legacy exceptions are explicit.


## Phase 2.3 provider implementation (2026-10-25)

The JavaScript/CommonJS provider domain is implemented under backend/src/organizations. ORGANIZATION_BACKEND explicitly chooses legacy Mongo routes or PostgreSQL providers; the PostgreSQL option requires reviewed PostgreSQL sessions and reuses the existing lifecycle. Hospital doctor membership is authoritative; hospital staff remain scoped roster identities with no EHR access.

ADR-018 adds a distinct optional clinicOwnerDoctorId on Hospital, separate from optional hospital-admin userId. A doctor-owned Hospital(type=clinic) has exactly one owning doctor and zero or more additional doctor members, with an explicit DoctorHospitalMembership for every practitioner. At most one owned clinic per doctor does not mean one doctor per clinic. The owner controls additions/removals of existing active practitioners; ownership grants no hospital-admin role, private receptionist/front desk or EHR authority. The forward-only 202610280001_phase23_group_clinic_membership correction reconciles this group-practice boundary with ADR-013 and ADR-014.

Phase 2.3 manages RecurringAvailabilityTemplate ownership/CRUD only. Both hospital and clinic contexts require current active explicit membership; each practitioner controls only their own calendar, including in a group clinic. A clinic owner cannot edit another member's schedule. Materialization, appointment-capacity queries, reservations, payment holds and booking stay in Phase 2.5. Provider DTOs preserve nested legacy shapes and public UIDs. See backend/prisma/ORGANIZATIONS.md for current endpoints, grants, setup and limits.

## Phase 2.4 patient implementation (2026-10-28)

The JavaScript/CommonJS patient domain uses the existing Patient/PatientBenefit/trusted-provider models. PATIENT_BACKEND explicitly selects legacy Mongo routes or PostgreSQL; the PostgreSQL option requires both reviewed PostgreSQL authentication and organizations, reusing their infrastructure and sessions. Configuration, record absence and database errors never trigger Mongo fallback.

Owner-only demographics include bounded emergency-card identity fields. Clinical allergies/conditions/medications/history/documents remain in Phase 2.6; billing remains Phase 2.8. Compatibility DTOs return safe empty arrays for deferred data without reading later-domain tables. Existing public MIDs and proven legacy mappings are preserved; new registration reuses centralized cryptographic MID generation.

Only a server-keyed, domain-separated Aadhaar HMAC persists. aadhaarPresent means stored securely, with no government verification claim. Auth presentation synchronizes only identity/names/phone. Public emergency scans require active patient identity and qrActive, return a deliberately narrow card and use distributed Redis limits. QR contains public identity/routing only.

Trusted provider != clinical consent. Patient doctor/hospital preferences grant zero EHR authority and alter no Phase 2.3 group-clinic membership, ownership or practitioner-calendar rules. Patient profile patches and preference creation use native row locking/composite keys; narrow SQL functions preserve ownership and precise benefit values. ADR-019 and backend/prisma/PATIENTS.md define this implemented boundary. Phase 2.5 materialization/booking, Phase 2.6 clinical/document APIs, Phase 2.8 billing and Phase 2.10 full backfill remain deferred.
