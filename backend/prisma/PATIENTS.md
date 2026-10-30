# Phase 2.4 patient demographics and benefits

Phase 2.4 adds the JavaScript/CommonJS patient domain under backend/src/patients. Existing Patient, PatientBenefit, PatientTrustedDoctor and PatientTrustedHospital models remain authoritative. Mongo remains the store for explicitly selected legacy and unmigrated domains. This phase performs no production cutover, full historical backfill, clinical migration or automatic dual writes.

## Configuration and lifecycle

Set PATIENT_BACKEND explicitly to legacy or postgres. Missing, unknown and auto values fail startup. Legacy mounts the existing Mongo patient routes. PostgreSQL requires both AUTH_BACKEND=postgres and ORGANIZATION_BACKEND=postgres, avoiding mixed Mongo provider identifiers in PostgreSQL trusted-provider relationships. The service reuses the reviewed sessions, Redis limiter and single PostgreSQL infrastructure lifecycle; database errors never select Mongo as fallback.

GET /api/patients/config returns only {"backend":"legacy"} or {"backend":"postgres"}. Examples retain legacy selection. Supply the reviewed auth/provider settings from AUTH_HARDENING.md and ORGANIZATIONS.md before opting in.

PostgreSQL mode additionally requires PATIENT_AADHAAR_HASH_KEY: at least 32 UTF-8 bytes, at most 512 characters, with no control characters. Generate it securely and supply it through environment/secret management. Do not commit it, reuse a public identifier as the key, or log it. Missing or invalid configuration fails closed. Treat key rotation as an explicit data-management decision: changing it changes the digest of a subsequently submitted identifier.

Public-scan settings are PATIENT_SCAN_WINDOW_MS (default 60000, range 100-3600000), PATIENT_SCAN_SOURCE_MAX (default 60) and PATIENT_SCAN_IDENTITY_MAX (default 120); each maximum ranges from 1 to 10000. The existing distributed Redis limiter uses an isolated patientScan operation and HMAC dimensions for source and requested identity. Raw MID/source values do not appear in Redis keys. The source is the direct socket peer; a proxy deployment needs a separately reviewed trust-proxy design. Limits return 429 with Retry-After; Redis failure returns a safe 503 rather than disabling protection.

Deploy all eleven forward migrations with the separate mediid_migrator credential. Phase 2.4 adds the tenth migration 202610280002_phase24_patient_demographics_benefits; Phase 2.5 adds 202610300001_phase25_appointments_scheduler. All ten previously pushed migrations remain unchanged. No Prisma schema redesign or dependency addition is needed. The application receives only mediid_runtime credentials.

## Patient identity and authorization

POST /api/auth/register remains the existing reviewed patient registration flow. It now reuses centralized cryptographic generatePatientUID(), preserving MID-XXXXXXXX public identity. User.uid equals Patient.uid; the patient UUID is separate. Existing UIDs are never rewritten. Registration creates the patient and safe auth presentation in the same transaction; a supplied phone is persisted through the actor-scoped patient mutation before commit. GET /api/patients/profile works immediately for the new PostgreSQL patient.

Protected routes authenticate current Phase 2.2B bearer sessions. Both application and PostgreSQL boundaries recheck the active User, current role exactly patient, Patient.userId ownership and matching nonnull User/Patient UID. Forged or stale role claims and trusted-provider relationships confer no authority. Doctors, hospital admins, hospital staff, support, buyers and pharmacies cannot read or write another patient's private profile.

Private imported profiles preserve existing matching public UIDs without imposing the new-patient eight-character format retroactively. Public emergency scans alone require canonical MID-[A-Z0-9]{8}. Imported compatibility id/_id uses a recorded patient Mongo ObjectId only when its UUIDv5 in the frozen namespace 57c0c744-9cdc-41f9-a532-7e60be63d87f also equals Patient.id; otherwise the stable PostgreSQL patient UUID is used. internalId remains separate and uid remains public identity.

## APIs and compatibility

| Endpoint | PostgreSQL Phase 2.4 behavior |
| --- | --- |
| GET/PUT /api/patients/profile | Current patient's private profile and allowlisted partial update |
| GET /api/patients/qr | Current patient's UID, generated QR and qrActive |
| GET /api/patients/scan/:uid | Public, Redis-limited safe emergency card |
| GET/POST /api/patients/medical-benefits | Current patient's active benefits / create |
| PUT /api/patients/medical-benefits/:id | Current patient's active benefit update |
| DELETE /api/patients/medical-benefits/:id | Current patient's benefit deactivation |
| POST /api/patients/government-benefits | Explicit legacy adapter into PatientBenefit |
| GET /api/patients/trusted-providers | Current patient's safe public provider summaries |
| POST/DELETE /api/patients/trusted-doctors/:doctorId | Add/remove own doctor preference |
| POST/DELETE /api/patients/trusted-hospitals/:hospitalId | Add/remove own organization preference |

Profile writes reject unknown or immutable fields, including identities, UID, email, role, password, ownership, benefit/trust relationships and all clinical/billing data. Names are bounded and nonblank, DOB is a real nonfuture calendar date, gender and blood group use the existing schema enums, and address/contact fields have explicit bounds and reject controls. Optional demographic values support explicit null clearing. Partial JSON updates become explicit flat fields; PostgreSQL locks the current row before merging, preserving unrelated concurrent changes.

The patient DTO retains _id, id, internalId, uid, firstName, lastName, dateOfBirth, gender, phone, address, profilePhoto, emergency, medicalBenefits, governmentBenefits, insurancePolicies, trustedDoctors, trustedHospitals, qrActive, createdAt and updatedAt. documents, bills and medicalHistory are safe empty compatibility arrays; they do not query later-domain tables. The legacy emergency allergies, chronicConditions and currentMedications arrays are also empty. Clinical input is rejected, rather than silently reported as saved.

When names or phone change, the same PostgreSQL transaction rebuilds auth_profiles.safe_profile from only _id/id, uid, firstName, lastName and phone. It never merges arbitrary old JSON or copies Aadhaar, emergency data, blood group, benefits, documents or billing data into authentication presentation.

## Aadhaar and emergency-card boundary

A valid emergency.aadhaarNumber is exactly a 12-digit string. The application immediately calculates HMAC-SHA-256 over the domain-separated value mediid:patient:aadhaar:v1: plus that identifier. Only the lowercase 64-hex digest enters Patient.aadhaarHash. Explicit null clears it; blank or malformed values are rejected. Neither plaintext nor digest is returned, placed in logs, JWTs, Redis keys, auth profiles, QR payloads or public scans.

The DTO exposes aadhaarPresent, also inside emergency for compatibility. The frontend leaves the Aadhaar input blank when one is on file and uses secure-storage wording. This is storage, not government verification or scheme-eligibility checking. Entering a new valid identifier replaces the digest; no Aadhaar verification integration is claimed.

The public card is available only when the linked User is active with role patient, its UID matches Patient.uid and Patient.qrActive is true. Hidden/inactive/nonexistent cards use the same safe not-found response. Only these fields are returned:

    {
      "uid": "MID-XXXXXXXX",
      "name": "Patient Name",
      "emergency": {
        "bloodGroup": "O+",
        "emergencyContactName": "Contact Name",
        "emergencyContactPhone": "+91...",
        "emergencyContactRelation": "Parent",
        "organDonor": false
      }
    }

No internal UUID, DOB, address, patient phone/email, Aadhaar, benefit, policy, trust relationship, authentication state or clinical record is exposed.

QR images are generated with the existing QR package and a bounded in-memory cache. Payload contains only uid, type=mediid_patient and verifyUrl pointing to /verify/patient/:uid. It excludes name, internal UUID, health information, policy data and credentials. Imported opaque QR bytes are not reused for patient cards, and large QR data URLs are not persisted to patient rows. Turning qrActive off disables the public card while retaining the owner's QR controls.

## Benefits and preferences

PatientBenefit is the single source of truth. Supported source/type combinations are government (ayushman, esi, cghs, state, other_govt), employer (group_mediclaim, corporate_insurance, esic_employer, other_employer) and personal (individual_insurance, family_floater, top_up, other_personal). Generic type strings grant no authority.

Create/update fields follow the existing model, with explicit allowlists for scheme/card/policy/beneficiary/employer/insurer/TPA details, family coverage, dates, network, claim process, helpline and notes. Family lists are at most 50 nonblank strings of 100 characters; longer free-text fields are at most 4000 characters. Dates must be real and validUntil cannot precede validFrom.

Coverage and room-rent amounts persist as PostgreSQL Decimal(12,2) and Decimal(10,2), are nonnegative and accept at most two fractional digits. Prefer decimal strings in API requests; compatible JSON numbers are accepted only when their canonical text passes the same fixed-point validation, without arithmetic. The database mutation accepts strings only. Responses preserve exact decimal strings. New benefits use UUIDv7. Updates/deactivation always constrain the row to the current patient; deleting retains the row with isActive=false and hides it from active lists.

GET /api/insurance remains the separate existing agency/mock catalog and is unchanged; it is not PatientBenefit storage.

The government compatibility endpoint maps legacy other to other_govt and insurance to personal/individual_insurance, mapping its card number explicitly to the policy number. Unsupported legacy fields are rejected. The endpoint keeps its array response. governmentBenefits and insurancePolicies are derived from active canonical rows, without duplicate storage or fabricated premium/agent information.

Trusted doctors and hospitals use the existing composite-key join tables. Identifiers accept canonical PostgreSQL UUIDs or proven Phase 2.3 legacy mappings; no mapping is guessed. New doctor trust requires an active doctor and, if linked, an active User with role doctor. New organization trust requires an active Hospital; clinic organizations are supported. Duplicate addition and repeated removal are idempotent. Inactive preferences can be removed; additions never reactivate a provider. Lists expose public provider summaries and omit private contacts. primaryHospitalId is irrelevant and group-clinic membership/ownership/calendar authority remains unchanged.

Trusted provider != clinical consent.

Trust grants zero EHR, document, billing or clinical access. Later clinical authorization still requires its reviewed consultation, Consent, AccessGrant or break-glass mechanism.

## PostgreSQL permissions, integrity and concurrency

Private reads and mutations use actor-scoped SECURITY DEFINER functions with fixed search_path=pg_catalog,public. Helpers are revoked from PUBLIC, mediid_runtime and mediid_diagnostics; entry points grant only necessary EXECUTE to mediid_runtime. No new direct patient/benefit/preference UPDATE/DELETE or private clinical/billing/research SELECT grant is introduced.

Every protected entry point rechecks current active-role ownership. Mutations lock User FOR SHARE before Patient FOR NO KEY UPDATE; partial patches merge after obtaining that lock. This follows the reviewed auth lock order and preserves unrelated concurrent fields. Benefit ownership remains part of every mutation. Existing trusted-provider composite primary keys enforce one canonical preference under concurrent additions.

Four forward-only NOT VALID benefit checks guard source, nonnegative coverage, nonnegative room rent and validity ordering. Both amount checks also explicitly reject PostgreSQL numeric NaN; canonical runtime decimal validation rejects it before persistence. PostgreSQL enforces them on new/updated rows without rejecting pre-existing imported rows at deployment; incompatible historical rows require explicit reconciliation before mutation/validation. Function boundaries additionally enforce source/type combinations, bounds and precise amounts.

## Deferred domains and verification

In PostgreSQL patient mode, document upload/delete, bills/payment, clinical history and all other unimplemented patient routes return AUTH_DOMAIN_NOT_MIGRATED (503). They do not fall back to Mongo. The Profile page disables/defer-labels clinical arrays and document controls. Dashboard QR remains supported; appointment requests now use the independently selected Phase 2.5 appointment module.

Phase 2.5 booking/materialization/reservations/holds/consultation/scheduler work is documented in APPOINTMENTS.md. Phase 2.6 clinical history/notes/conditions/allergies/prescriptions/documents/EHR/consent enforcement, Phase 2.8 billing and Phase 2.10 full backfill remain unimplemented. The materializer requires active template AND active doctor AND active organization AND current explicit membership.

From backend, run:

    npm run prisma:validate
    npm run prisma:generate
    npm run check:js
    npm run test:patients:unit
    npm run test:patients
    npm run test:patients:http

Rerun the required native schema/review/concurrency, infrastructure, auth/session/Redis/provisioning/reconciliation/staff/HTTP, organization/group-clinic/server and legacy suites, then frontend tests/build. All data/services must be synthetic and disposable. Independent native PostgreSQL connections are required for patient-patch, duplicate doctor/hospital trust and ownership-isolation race evidence; PGlite is not concurrency evidence. Actual executed results, limitations and external-review status are recorded in DEVELOPMENT_STATUS.md.
