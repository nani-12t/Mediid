# PostgreSQL clinical records (Phase 2.6)

The JavaScript/CommonJS clinical domain lives in `backend/src/clinical`. Appointment remains a scheduling/business event; Encounter is an episode of clinical care. Canonical clinical rows are never embedded in Patient JSON. MongoDB remains the explicit legacy deployment example; this phase performs no production cutover or historical backfill.

## Explicit configuration and deployment

Set `CLINICAL_BACKEND=legacy` or `postgres`. Missing, unknown and `auto` values fail startup. PostgreSQL requires all of `AUTH_BACKEND`, `ORGANIZATION_BACKEND`, `PATIENT_BACKEND` and `APPOINTMENT_BACKEND` to be `postgres`. Legacy clinical routing requires compatible legacy authentication; PostgreSQL sessions never enter the Mongo EHR router. Only one doctor portal implementation is mounted.

`GET /api/clinical/config` returns only `{backend:"legacy"}` or `{backend:"postgres"}`. Database absence, configuration errors and PostgreSQL failures never select Mongo as fallback. Clinical errors expose bounded codes/messages, never connection details or clinical request bodies.

Deploy `202611010001_phase26_clinical_records` as migration thirteen using the separate migrator credential after all twelve reviewed migrations. Historical SQL, the Phase 1.3.1 context guard, reservation/financial protections and UUIDv5 namespace remain unchanged. The forward migration adds nullable Allergy.encounterId/Encounter.allergies, four nullable AccessLog resource/purpose/basis columns and nullable audit patientId solely for unresolved denied targets. Existing rows are retained. New integrity checks reject incompatible existing clinical values instead of deleting or repairing history.

## Active access bases

Exactly two clinical access bases are active:

- `PATIENT_SELF`: current active patient User, linked Patient ownership and matching User/Patient public UID; no consultation window is needed.
- `ACTIVE_CONSULTATION`: current active User whose current role is exactly doctor, active linked Doctor, valid operational appointment, exact ConsultationSession and current active organization with explicit DoctorHospitalMembership.

Doctor authorization rechecks database state on every operation. The session must match the exact doctor, patient, organization and split appointment-domain foreign key, have status active and nonnull startsAt, and satisfy `startsAt <= clock_timestamp() < expiresAt`. Stored bounds must equal the Phase 2.5 appointment's slotStart minus ten minutes and slotStart plus two hours. The parent must be confirmed/checked_in with its matching materialized interval and own CONFIRMED reservation. Historical/imported appointments or random session rows do not create operational authority.

For a 14:00 slot, 13:49:59 is denied; 13:50:00 may open if status is active; 16:00:00 is denied even if a scheduler has left status active. Direct EHR authorization uses PostgreSQL time/state and no Redis cache. The existing appointment scheduler still requires Redis; an outage cannot extend the timestamp window.

Hospital admin is not doctor. Receptionists, other staff, support, buyer/research and pharmacy roles have zero EHR authority. A genuine separately authenticated secondary doctor session must satisfy the same exact practitioner checks. Clinic ownership, primaryHospitalId and another doctor's consultation grant nothing.

Trusted provider != EHR permission. Consent row != active permission yet. AccessGrant row != active permission yet. BreakGlassEvent row != active permission yet. These models remain intact for future reviewed workflows; no phase activates them as shortcuts. Research DatasetConsent/DatasetAccessGrant cannot authorize clinical access.

## Audit and SQL boundary

Runtime receives EXECUTE only on `mediid_clinical_read(uuid,text,jsonb)` and `mediid_clinical_command(uuid,text,jsonb)`. Private helpers and triggers use fixed `search_path=pg_catalog,public`; helpers are revoked from PUBLIC, runtime and diagnostics. No direct clinical-table mutation, research access or new financial-table access is granted.

An authenticated clinical authorization decision appends AccessLog with actor, known patient/doctor, exact appointment/session where applicable, bounded action/reason, resourceType/resourceId, purpose and accessBasis. Existing resource UUIDs are recorded; bundle reads and unresolved/nonexistent targets do not receive invented resource UUIDs. Unknown patient targets use patientId NULL only for denied/NONE records. Logs contain no clinical payload or consultation token.

Denied decisions return `{allowed:false,reason,...}` from the SQL statement after appending the log. The service throws the HTTP 403 only after that statement commits, preserving denied evidence. Runtime cannot UPDATE, DELETE or TRUNCATE logs; append-only triggers also protect them from cascaded rewriting/deletion. There is no audit deletion API. Administrative retention changes require a separate reviewed migration/maintenance workflow.

Authorization and writes share database locks on the parent appointment, live actor/provider/membership/session and encounter. Database time is checked after waiting for authority locks and after mutation; expiry during mutation rolls back clinical changes inside a subtransaction while the denied audit is appended outside it. The repository retries an entirely aborted deadlock/serialization statement at most three times.

## API

All protected routes use current Phase 2.2B bearer sessions and no consultation-token authentication.

| Endpoint | Behavior |
| --- | --- |
| GET /api/doctor-portal/queue | Doctor's own bounded scheduling context and server-derived access state; no longitudinal EHR |
| GET /api/doctor-portal/patient/:uid | Canonical MID lookup and independently authorized bounded EHR bundle |
| POST /api/doctor-portal/encounters/start | AppointmentId only; derive patient, doctor, organization and appointment domain |
| POST /api/doctor-portal/encounters/:id/complete | Exact doctor and current consultation context; atomic care completion |
| POST /api/doctor-portal/encounters/:id/vitals | Technical vital values with server-derived encounter provenance |
| POST /api/doctor-portal/encounters/:id/notes | Bounded meaningful SOAP and reviewed note type |
| POST /api/doctor-portal/encounters/:id/conditions | Structured condition attached to the encounter patient |
| POST /api/doctor-portal/encounters/:id/allergies | Allergy with mandatory new encounter provenance |
| POST /api/doctor-portal/prescription | Verified appointment/encounter selectors and structured items |
| GET /api/clinical/me/encounters | Current patient's structured clinical history with limit/cursor |
| GET/PUT /api/patients/profile | Existing demographics plus clinical compatibility presentation |
| POST /api/patients/documents | Current patient's HTTPS document metadata registration |

Queue access is scheduling access, not EHR permission. Queue access hints and safe opensAt/expiresAt never replace endpoint authorization. Unrelated doctors receive generic denial; hints refer only to the requesting doctor's own consultation. No consultation token enters queue, EHR, profile, audit response or frontend state.

Encounter start locks the operational appointment: zero linked encounters creates one, one reuses it, and unexpected multiplicity returns reconciliation conflict. There is no new global unique constraint; historical/direct multiple encounters remain valid. New runtime encounters are ambulatory/in_progress and cannot be created without an operational appointment.

Completion atomically sets completed/endTime, completes the relevant appointment and ConsultationSession and retains all care data. Concurrent completion reuses the stable final state/endTime. A repeat completion may reuse that same completed context only within its frozen time window with current actor/provider/membership; it does not reopen EHR. Scheduling completion is blocked while an encounter is in_progress. Ordinary clinical POST operations reject completed encounters.

## Clinical values and prescriptions

Vitals use broad technical storage bounds, with no normal/abnormal or diagnostic labels: systolic 1-400, diastolic 1-300, heart rate 1-400, respiratory rate 1-150, Celsius 20-50, SpO2 0-100, weight/height 0.01-999.99. Decimal values enter SQL as fixed-point strings. When weight and height are both supplied, PostgreSQL derives BMI rounded to two places; a value outside the existing Decimal(4,2) capacity is rejected. Client BMI is rejected.

Notes allow progress, consultation, discharge or procedure and require at least one nonblank SOAP field. Each SOAP field is at most 4000 characters. Author is the current doctor User. Conditions use active/resolved status, bounded explicit names/codes/verification status and real calendar dates. The create operation derives resolvedDate consistently for a resolved condition; condition identity is never rewritten.

Allergy severity is null or mild/moderate/severe/fatal. New doctor allergies derive both patient and encounter. Historical/imported encounterId NULL stays valid. Forward/reverse context checks serialize allergy provenance against encounter patient changes.

Prescriptions start active and derive patient/doctor/organization/status/issuedAt from the verified encounter. Require 1-50 items with medicationName and dosage, positive bounded integer quantity, and bounded form/frequency/duration/instructions. A failed item rolls back the whole prescription and every item. Free-text-only prescription blobs and client identity/author/status injection are rejected. Issuance neither completes an encounter automatically nor creates PharmacyDispense, inventory changes or BillingRecord.

## History and compatibility

EHR returns safe patient identity, consultation context, encounters and structured conditions/allergies/prescriptions/documents. No Aadhaar, password/session secret, unnecessary benefits/billing/marketplace data or consultation token is returned. Auth profile composition remains unchanged and contains no clinical data.

Encounter order is startTime DESC, id DESC. The cursor identifies an existing encounter owned by the same patient; default limit is 20 and maximum 50. Nested encounter artifacts are limited to 20 each, related conditions/allergies to 100, top-level prescriptions/documents to 50, and prescription items to 50. Pagination metadata exposes these limits. Text from historical rows is bounded on read without changing stored history.

Profile medicalHistory is a recent bounded adapter derived from Encounter, notes, conditions, prescriptions and safe provider summaries. It is not stored separately. Profile documents are canonical metadata. clinicalHistoryPagination identifies the summary bounds and next page; the structured self endpoint supports older encounter pages.

Emergency compatibility arrays are read-only derivations: recorded allergy substances, active conditions and items from active prescriptions. The legacy chronicConditions key is an active-condition presentation adapter and makes no chronicity inference. Current medication information describes active prescriptions, never adherence. Cancelled prescriptions do not populate current medications. Patient demographic PUT still rejects clinician fields. Bills remain empty.

Public `GET /api/patients/scan/:uid` remains the frozen narrow Phase 2.4 emergency card and returns none of these clinical records.

## Document metadata and retention

Metadata registration accepts type, title, fileUrl, fileName, fileSizeBytes, mimeType and notes. The patient and uploadedByUserId are server-derived; encounterId is NULL. Only bounded HTTPS references without embedded credentials, query secrets or fragments are accepted. File size metadata is 0-104857600 bytes. URLs are never fetched, downloaded, scanned, OCR'd or sent to AI.

This registers an existing secure object reference. It provides no hosting/upload provider or DigiLocker integration. PostgreSQL UI never reads local files into base64; explicit legacy mode retains its historical behavior. Existing unsafe or signed document references are redacted on read while safe metadata remains available. Embeddings and storage credentials are excluded.

Document deletion/withdrawal and clinician document creation are deferred. Patient APIs cannot delete encounter-linked documents. No generic DELETE endpoints exist for encounters, vitals, notes, conditions, allergies, prescriptions/items or audits; no clinical history is destroyed.

## Verification and deferred work

Run Prisma validate/generate, check:js, test:clinical:unit, test:clinical, test:clinical:concurrency and test:clinical:http, followed by the existing full regression gate and frontend tests/build. Native clinical tests require independent actual PostgreSQL connections; actual HTTP tests use disposable PostgreSQL/Redis/MongoDB. All fixtures are synthetic. Actual results are recorded in DEVELOPMENT_STATUS.md; an unexecuted required test is not a pass.

Phase 2.7 pharmacy dispensing, Phase 2.8 unified billing, Phase 2.9 research pipeline, diagnostics mutation, consent/grant/break-glass activation, amendments, document hosting/withdrawal, AI/NLP, historical backfill and production cutover remain deferred.
