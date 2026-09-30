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
