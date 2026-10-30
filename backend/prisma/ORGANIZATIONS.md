# Phase 2.3 provider hierarchy

Phase 2.3 adds the PostgreSQL provider domain in JavaScript/CommonJS. Mongo remains the business store for unmigrated domains. No production cutover or historical provider backfill runs at startup.

## Configuration and lifecycle

Set ORGANIZATION_BACKEND explicitly to legacy or postgres in the application environment. Missing, unknown and auto values fail startup. The legacy value mounts the existing Mongo hospital/doctor/staff routes. The postgres value requires AUTH_BACKEND=postgres and the reviewed Phase 2.2B RSA/session/Redis/SMTP configuration; it reuses that runtime's single PostgresInfrastructure owner. Authentication or PostgreSQL provider errors never select Mongo as a fallback.

GET /api/organizations/config reports the selected provider backend. See .env.example and AUTH_HARDENING.md. No dependency was added or upgraded in this phase.

Deploy all eleven migrations in order using the separate mediid_migrator credential: the original seven, 202610250001_phase23_provider_hierarchy, the forward-only 202610280001_phase23_group_clinic_membership correction, then 202610280002_phase24_patient_demographics_benefits and 202610300001_phase25_appointments_scheduler. All ten previously pushed migrations remain unchanged. The new patient boundary is documented in PATIENTS.md and does not alter the approved provider/group-clinic functions. The original provider migration adds the optional clinic ownership relation; the correction adds narrowly scoped membership operations and updates template authorization. The application receives only mediid_runtime credentials.

Existing hospital-admin and private-doctor identities come from the reviewed identity reconciliation/operator provisioning boundary; this phase does not add public privileged account registration or a full Mongo backfill.

## Clinic ownership (ADR-018)

Hospital.userId remains the distinct hospital-admin owner when present. Hospital.clinicOwnerDoctorId is a nullable unique FK to Doctor. A database XOR check permits either the admin user or the clinic-owner doctor; doctor ownership additionally requires type=clinic. A doctor owns at most one clinic in this phase. Each doctor-owned clinic has exactly one owning doctor and zero or more additional doctor members; one owned clinic per doctor does not mean one doctor per clinic. Every practicing doctor, including the owner, requires an explicit DoctorHospitalMembership.

POST /api/hospitals accepts an active, authenticated private-practice doctor. The database locks that doctor and atomically creates the Hospital(type=clinic), public HID, explicit DoctorHospitalMembership and attributed audit entry. Concurrent duplicates yield one clinic and a safe conflict. The doctor's auth role remains doctor. Existing primary membership is retained; a first membership may populate convenience primary metadata.

PUT /api/hospitals/:id lets that doctor edit only their clinic's allowlisted profile fields. Hospital-admin profile ownership is a separate route and policy. Private clinics receive no receptionist/staff recruitment or hospital-admin authority; the shared provisioning guard rejects clinic organizations, including legacy admin-owned clinic rows. The resulting Hospital.id is valid for the future organizational FK invariant; Phase 2.3 never creates an appointment to demonstrate it.

## Group-clinic practitioner memberships

Only the current active PostgreSQL doctor identified by Hospital.clinicOwnerDoctorId may add or remove practitioner memberships for that active Hospital(type=clinic). Ownership is checked in PostgreSQL; primaryHospitalId and another organization's authority grant nothing. The owner remains role doctor.

POST /api/hospitals/:clinicId/doctor-memberships accepts exactly {"doctorId":"<doctor identifier>"}. clinicId and doctorId support canonical PostgreSQL UUIDs or canonical lowercase Mongo ObjectIds only when the imported mapping is proven by the existing identity link. This request does not accept public UIDs or guess identifier types. The target Doctor must already exist and be active; if linked to a User, that User must be active with role doctor. The operation atomically creates one non-primary explicit membership and attributable audit, preserving existing primary metadata. Concurrent duplicate additions produce one relationship and a safe conflict.

DELETE /api/hospitals/:clinicId/doctor-memberships/:doctorId removes only a non-owner doctor's membership in that clinic. It preserves the Doctor, linked User, other memberships and audit history. If the removed membership was primary or primaryHospitalId points to that clinic, primaryHospitalId is cleared to NULL; no other membership is promoted or modified. The owner cannot remove their own ownership membership through this generic route. Clinic ownership transfer/deletion is outside this correction.

No identity, activation credential, hospital_admin role, receptionist/front-desk authority or EHR permission is created. Unrelated doctors, hospital admins, hospital staff, support agents and patients cannot manage these memberships. Clinic owners control membership; every practitioner controls only their own calendar.

Public GET /api/doctors?hospital=<clinic identifier> and clinic detail use the explicit memberships to present all active clinic doctors consistently. Public DTOs continue excluding private doctor contact and registration fields.

## APIs and compatibility

| Endpoint | Phase 2.3 behavior |
| --- | --- |
| GET /api/hospitals, /top, /:id, /uid/:uid | Public active provider search/detail |
| GET/PUT /api/hospitals/admin/profile | Active hospital-admin owner only |
| POST /api/hospitals | Private-doctor clinic creation |
| PUT /api/hospitals/:id | Owning private doctor updates clinic profile |
| POST /api/hospitals/:clinicId/doctor-memberships | Owning doctor adds an existing active doctor to that clinic |
| DELETE /api/hospitals/:clinicId/doctor-memberships/:doctorId | Owning doctor removes only a non-owner clinic membership |
| GET /api/doctors, /:id, /uid/:uid | Public active doctor search/detail using explicit memberships |
| GET /api/doctors/:id/manage | Same-hospital admin reads private management contact fields |
| POST /api/doctors | Same-hospital admin uses reviewed secure provisioning |
| PUT /api/doctors/:id | Same-hospital admin; explicit membership required |
| DELETE /api/doctors/:id | Remove only actor hospital's membership; retain doctor/account/other affiliations |
| GET/POST /api/staff, GET/PUT/DELETE /:id | Scoped hospital-admin roster; deletion deactivates |
| GET /api/staff/uid/:uid | Active safe badge lookup; no personal contacts/user/audit data |
| GET/POST /api/doctor-portal/availability-templates | Current doctor's own recurring templates |
| PUT/DELETE /api/doctor-portal/availability-templates/:id | Current doctor's template update/deactivation |

Public hospital ranking is computed in PostgreSQL as ratingAverage * log10(ratingCount + 1), descending, then UID/ID for ties. Filters q, city, specialty, rating and type are bounded and parameterized. Doctor filters q, specialization, hospital and available use explicit DoctorHospitalMembership; primaryHospitalId never grants affiliation or edit authority. Doctor ordering is rating average, count, UID and ID.

Array responses remain compatible. Search limit defaults to 100 (maximum 100); page starts at zero and is bounded. Staff list reads are additionally capped at 500; own template list at 1000, with a 100-row API response cap. Exact scoped staff/template lookups do not depend on these list windows. The available doctor filter means the provider's status=available, not booking capacity.

DTOs assemble address, contact, rating.average/count, experience, photo, hospital and memberships. Raw Prisma rows, login credentials, owner fields, counters and audit contents are never returned. Public doctor responses omit personal contact/registration fields. A verified hospital admin searching with their own hospital filter receives management contact fields; unrelated or anonymous searches retain public DTOs.

Canonical UUID path IDs are supported. Canonical lowercase Mongo ObjectIds are resolved through the frozen UUIDv5 namespace only when the imported auth link proves that same provider mapping. UID lookup is explicit through /uid/:uid; the public UID is never replaced with a UUID. Imported provider id/_id and QR bytes are preserved when recorded by identity reconciliation. New providers use their UUID as id/_id, expose internalId separately and retain HID/doctor/staff public UIDs.

Doctor recruitment wraps the reviewed Phase 2.2B provisioning and any allowlisted profile additions in one transaction: atomic sequence, DOC UID, explicit membership, digest-only activation credential and audit. The authorized response contains a doctor DTO plus activation.secret/expiresAt. The management page displays that one-time handoff in component state; it never stores it in URLs, browser storage or logs. Activation still requires UID plus the separate secret and a new password.

New QR images use the existing mediid_doctor/mediid_staff type and /verify/{type}/{publicUID} convention. Internal UUIDs and activation credentials are excluded from QR payloads. Staff UIDs retain NUR, REC, LAB, PHR, RAD and ADM role codes, with STF for other roles. The hospital's one staff sequence spans roles.

Generic updates reject immutable owner/user/UID/role/rating/sequence/private-practice inputs. Hospital settings and doctor edits use explicit PostgreSQL payload allowlists; legacy UI submissions retain their previous behavior. Roster membership is not an authenticated identity; existing hospital_staff identity links remain controlled by Phase 2.2B.

## Availability and deferred scheduling

RecurringAvailabilityTemplate CRUD is doctor-owned. Hospital and private-clinic contexts both require a current active explicit DoctorHospitalMembership and an active organization. An additional group-clinic doctor does not need to own the clinic to manage their own clinic-context templates. The clinic owner cannot create, update or remove another doctor's templates. After membership removal, the removed doctor cannot create or update templates for that clinic; primaryHospitalId alone grants nothing. Null context remains valid only for private-practice doctors. Another doctor, hospital admin, staff or support agent cannot edit a doctor's independent templates.

Templates validate day, time range, date range, timezone, channel and numeric bounds. They remain the provider-owned source templates. The separate Phase 2.5 appointment module now implements materialization, overrides, reservations, holds, booking and consultation windows; see APPOINTMENTS.md. Deprecated DoctorSlot never computes operational capacity.

In PostgreSQL provider mode, /api/doctor-portal/slots/available and remaining queue/EHR routes return AUTH_DOMAIN_NOT_MIGRATED. Other protected unmigrated domains retain the Phase 2.2B gate. Phase 2.4 patient demographics and Phase 2.5 operational appointments are implemented separately; clinical data, pharmacy, unified billing, marketplace and AI remain outside this provider module.

## Runtime permissions and verification

Runtime receives only reviewed provider profile/membership SELECT columns. Private staff rows and availability templates are accessed through actor-scoped functions, not direct table grants. Sensitive mutations use parameterized SECURITY DEFINER functions with fixed search_path, current active-role/ownership/membership checks and attributed audits. Helper functions, activation digests and audits are not callable/readable by runtime. Runtime retains no clinical/document/research/payment reads, DDL/history mutation or role escalation.

Run from backend:

    npm run prisma:validate
    npm run prisma:generate
    npm run check:js
    npm run test:organizations:unit
    npm run test:organizations
    npm run test:organizations:http
    npm run test:organizations:group

Required existing schema/native/infrastructure/auth/Redis/Mongo suites and frontend tests/build are also rerun. New tests use disposable synthetic PostgreSQL, Redis and Mongo; independent native connections demonstrate concurrency. PGlite is used only for existing single-session schema regressions. Evidence stays in ignored .test-data; concise executed results belong in DEVELOPMENT_STATUS.md. Phase 2.3, including its targeted group-clinic correction from b1548d87bb9c6b81da728bdd702a9895c2de6e99, is COMPLETE and externally reviewed at 908cb967afd9162e3a9be78d71cd13c477be4ffe. Historical correction verification remains recorded separately from initial Phase 2.3 evidence; current Phase 2.4 regression results are recorded in DEVELOPMENT_STATUS.md.
