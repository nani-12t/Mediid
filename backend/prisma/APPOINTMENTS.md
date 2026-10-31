# PostgreSQL appointments (Phase 2.5)

The operational appointment domain is JavaScript/CommonJS in `backend/src/appointments`. MongoDB remains the deployment default until an explicit cutover. Phase 2.5 adds no EHR or unified billing API.

## Configuration and lifecycle

Set `APPOINTMENT_BACKEND=legacy` or `postgres` explicitly. Missing, `auto`, and other values fail startup. PostgreSQL appointments require `AUTH_BACKEND=postgres`, `ORGANIZATION_BACKEND=postgres`, and `PATIENT_BACKEND=postgres`. `GET /api/appointments/config` exposes only the selected backend.

PostgreSQL mode requires explicit `APPOINTMENT_REDIS_URL`; production requires `rediss:`. `APPOINTMENT_MATERIALIZE_DAYS_AHEAD` defaults to 30 and accepts 7–90. `APPOINTMENT_SCHEDULER_INTERVAL_MS` defaults to 5000; materialization repeats every 900000 ms by default. The queue namespace defaults to `mediid-appointments-v25`. All instances for one database must share that namespace and Redis service.

The runtime starts PostgreSQL materialization and housekeeping after BullMQ/Redis readiness, before HTTP listening. Startup errors stop the server. Shutdown closes workers, queues and Redis connections before the authentication PostgreSQL lifecycle. PostgreSQL mode never starts the Mongo scheduler, in-memory scheduling fallback, or legacy unauthenticated Socket.IO. Runtime queue failures do not switch scheduling engines; queued work resumes through an operator restart after Redis recovery.

## Database deployment

Deploy the new forward migration `202610300001_phase25_appointments_scheduler` after the ten historical migrations through the existing migrator credential. Do not replay or edit historical SQL. It adds consultation start bounds/unique appointment references, notification claims, scoped runtime operations, and the membership removal integration guard. Existing duplicate consultation references fail migration rather than being deleted.

Then deploy the forward-only correction `202610310001_phase25_availability_timezone` as migration twelve. It replaces only the availability read branch and adds a private timezone resolver; the pushed Phase 2.5 migration remains unchanged.

The Phase 1.3.1 booking, reservation, financial and retention triggers remain authoritative. Runtime receives narrow function execution, not direct appointment/financial/history writes. Helpers are revoked from PUBLIC, runtime and diagnostics. Existing clinical/research/billing access remains closed.

## Materialization and overrides

A template materializes only when it and its doctor and organization are active and a current explicit DoctorHospitalMembership exists. Clinic ownership and primaryHospitalId grant no substitute authority. This applies equally to hospitals, individual clinics and group clinics.

PostgreSQL converts recurring local times using the template IANA timezone, default Asia/Kolkata, into UTC timestamptz instants. Node process timezone never converts recurring calendars. Slots copy doctor, organization, interval, channel and capacity from the template and receive UUIDv7 identifiers. Exclusion constraints arbitrate overlapping concurrent materializers; reruns retain one canonical set. Historical Appointment and deprecated DoctorSlot never provide operational capacity.

Only the owning doctor manages overrides at `/api/appointments/overrides`. LEAVE, HOLIDAY and EMERGENCY_BLOCK prevent overlapping generation and block unreserved future slots. Conflicting active future reservations cause a conflict requiring explicit cancellation or rescheduling.

CUSTOM_HOURS conservatively narrows existing template capacity on the local calendar dates touched by the override: a full generated slot must lie inside an applicable custom window. It creates no capacity, channel or duration by itself. Existing reservations are never silently cancelled. Adding or removing custom windows evaluates their full union together with all remaining blocking overrides. A change that would invalidate an active reservation conflicts atomically. Removing a block can retire unreserved blocked metadata for safe rematerialization; released reservation history is retained.

Membership removal shares provider locks with booking and materialization. Active future bookings prevent removal; valid removal blocks unreserved future slots and preserves history.

## Discovery, booking and capacity

`GET /api/appointments/availability?doctorId=…&hospitalId=…&date=YYYY-MM-DD` returns bounded bookable slots and remaining capacity. Public/patient discovery exposes ONLINE and FLEXIBLE. Authorized scheduling actors may request OFFLINE discovery for their scope. Provider identifiers resolve through the reviewed organization mapping rather than trusting arbitrary legacy IDs.

Discovery derives its authoritative IANA timezone from active matching recurring templates in the slot's doctor/organization context. A match must cover the effective local date and weekday, exact duration and time grid, channel and capacity, and the materializer's DST roundtrip rules. Matching templates must agree on the timezone and agree with the existing legacy tuple resolver. Missing, inactive, invalid, ambiguous or inconsistent authority excludes the slot safely; discovery never guesses Asia/Kolkata.

The requested `date` is the provider/template-local calendar date, independently for each slot. Each result includes `id`, `doctorId`, `hospitalId`, `slotStart`, `slotEnd`, `channel`, `capacity`, `remainingCapacity`, `timezone` and `timeSlot`. PostgreSQL supplies the authoritative IANA `timezone` and formats `timeSlot` as `HH24:MI` in that zone. A New York 23:00 slot is returned for its New York date and excluded for the adjacent India date. Clients cannot override timezone through a query parameter.

PostgreSQL booking and rescheduling display those API fields directly and exclude missing/malformed timezone or local-time metadata. They book/reschedule by `slotId`; they do not convert UTC instants using browser or Kolkata defaults. Explicit legacy mode retains its existing behavior.

`POST /api/appointments` prefers `slotId`. The legacy doctor/hospital/date/time tuple is accepted only when it resolves to exactly one materialized interval. Server-derived fee, deposit, deadline, snapshot, actor, seat and status fields are rejected as client input.

A patient books only themselves. Front desk resolves an existing patient; booking never creates identities. Hospital type government/private/trust creates HospitalAppointment; type clinic creates PrivateClinicAppointment with required organization context. New bookings never enter the historical appointments table.

Appointment channel ONLINE/OFFLINE is independent of booking source ONLINE_APP/WALK_IN/PHONE/SUPPORT_ASSISTED. Online requires ONLINE/FLEXIBLE slots; offline requires OFFLINE/FLEXIBLE. Explicit reservations, a locked slot and unique active seat numbers provide capacity. HELD and CONFIRMED consume seats. Released/expired reservation history is retained.

Slot state is aggregate metadata. Partially occupied slots remain bookable; full slots become HELD/BOOKED. Releasing a full slot reopens capacity and increments reopen metadata. BLOCKED/EXPIRED never become bookable through a generic state refresh.

## Authority and privacy

Hospital scheduling requires the owning active hospital_admin or an active linked hospital_staff with exact receptionist role at that hospital. Other staff roles, unlinked/inactive staff, cross-hospital actors and clinic receptionist authority are denied. Receptionists cannot change policies or doctor overrides.

Each private practitioner manages only their own appointments and policy, including in a group clinic. Ownership grants no authority over another member's bookings/calendar. An exact appointment doctor may check in where supported; hospital final MANUAL confirmation remains front-desk owned.

Support bookings require an existing patient, SUPPORT_ASSISTED source and attributable booking/handling users. Support obeys capacity, payment, cutoffs and provider policies, cannot force confirmation or patient transfer approval, and receives scheduling-only DTOs without symptoms/notes or EHR. Trusted providers grant no scheduling or clinical authority.

Patient list: `GET /my`. Front desk: `GET /hospital`, `GET /hospital/count`. Own doctor scheduling: `GET /doctor`. Support lookup: `GET /support` with explicit patient identifier, or an authorized appointment lookup. Normal DTOs unify both tables and preserve legacy IDs, nested parties, dates/time, bookingMethod, contact fields, status and appointment finance summaries; no raw financial ledger or confirmation credential is returned.

## Frozen policy, payments and confirmation

Provider policy is created from schema defaults in PostgreSQL and frozen at booking. Hospital policy changes require hospital_admin; clinic policy changes require that doctor. Receptionist/support cannot modify policy. A genuine reschedule takes a fresh snapshot; same-slot edits retain it. Executable cancellation terms are the typed frozen policy fields. The historical cancellationRules JSON has no authoritative executable schema: nonempty/unsupported values fail booking closed for operator reconciliation rather than being silently ignored or interpreted as arbitrary rules.

PostgreSQL `appointment_payment_deadline` computes holds. Default normal/safety/fast-threshold/fast-window/minimum-online-lead values are 60/10/20/5/10 minutes. For a 14:00 appointment: 13:20 → 13:50, 13:43 → 13:48, 13:48 → 13:50; exactly 13:50 and later are closed. HELD reservations copy the exact stored deadline, preserving microseconds.

Private clinic ONLINE requires a 50% deposit rounded in PostgreSQL to two decimal places. Offline bookings need no online hold. Hospital deposits follow the frozen policy. Payment satisfaction and final confirmation are distinct:

- DEPOSIT finalizes after required capture.
- TIME_BASED remains pending until slotStart minus confirmationLeadMinutes (default 40), with valid reservation/payment prerequisites.
- MANUAL remains pending until authorized front desk acts.
- Patient acknowledgement never bypasses these rules.

`PUT /:id/pay` requires `Idempotency-Key` and an empty body. The service persists AppointmentPayment, calls the configured provider, verifies its response and records capture through a scoped transition. Repeating one operation reuses the intent/result; conflicting reuse is rejected, including a key from a previous rescheduling epoch. Additional deposit payments charge only the server-computed outstanding amount. AppointmentFinancialEvent is generated by existing triggers only.

`APPOINTMENT_PAYMENT_PROVIDER=test` is deterministic for synthetic development/testing and is rejected in production. Default `disabled` fails payment/refund execution closed. No production gateway is supplied in this phase; a reviewed real adapter must implement provider idempotency and capture/refund verification before production payment use. No client success flag, amount or transaction reference is accepted.

A real capture arriving after expiry/cancellation is retained, never reclaims a seat, and creates policy-required refund/reconciliation. Persisted intents allow idempotent reconciliation after a response/database interruption. Financial actors remain the initiating user; worker reconciliation does not impersonate a patient.

## Cancellation, refund and rescheduling

`DELETE /:id` handles owner patient cancellation and authorized provider/support cancellation. `PUT /:id/status` allows explicit authorized transitions; cancelled/expired/completed states cannot be resurrected. `POST /:id/check-in` requires the authorized scheduling actor or exact appointment doctor.

Patient/support cancellation uses frozen normal/late percentages and cutoff. Provider cancellation guarantees 100% of captured amounts or an explicitly approved patient transfer. `POST /:id/transfer-approval` is a current patient action; provider/support cannot approve it. Without approval the system refunds.

AppointmentRefund retains provider/reference/idempotency/status records and consumes the existing atomic refundAllocated allocation. Original payments and immutable financial history remain intact. Refund processing cannot delay capacity release.

`POST /:id/reschedule` selects a real materialized slot. One transaction locks the booking and deterministically ordered old/new slots, checks cutoff/count, releases old history, takes a fresh snapshot/deadline, reserves the new seat and updates consultation bounds. Active status remains pending/confirmed; it never uses terminal rescheduled to release the new reservation. Cross-doctor/domain substitution is rejected. An unresolved payment intent blocks rescheduling until reconciliation. A new fee below already captured funds also conflicts for explicit financial reconciliation. A paid DEPOSIT booking stays confirmed when the fresh required deposit is already satisfied; TIME_BASED and MANUAL still follow their own finalization rules.

## Confirmation credentials and delivery

New credentials use 32 cryptographically random bytes. Only SHA-256 digests enter confirm_token; normal DTO confirmToken is null. Only the notification component receives the raw delivery credential. No raw secret is written to logs, SQL, Redis keys, queue jobs, JWT or audit text.

Authenticated patient confirmation uses `POST /:id/confirm`. Public `GET /confirm/:token` hashes a bounded credential and consumes it once under row locking, with a generic invalid/expired result. Redis HMAC source/digest throttles apply across instances; outage returns unavailable and never disables protection.

`APPOINTMENT_NOTIFICATION_DELIVERY` selects disabled (default), smtp or twilio. Configured transports avoid legacy payload logging. Tests inject synthetic delivery. Initial confirmation delivery happens after commit; failure cannot corrupt booking/reservation. Reminders use durable database notification claims and BullMQ processing; repeated workers do not send a second logical notification. Authenticated account links allow reminders without storing a recoverable raw credential.

## Consultation windows and jobs

Final confirmation creates one internal ConsultationSession, initially scheduled:

- startsAt = slotStart − 10 minutes
- expiresAt = slotStart + 2 hours

The activation worker uses the inclusive start and exclusive end. Cancellation expires the context; completion marks it completed; rescheduling atomically recalculates bounds. Session tokens remain internal cryptographic material, never an authentication substitute. Early confirmation grants no early clinical access.

BullMQ schedules rolling materialization, hold expiry/TIME_BASED confirmation, consultation activation/expiry, notification claims, payment reconciliation and refunds. Queue names/job payloads carry no patient ID, MID or confirmation credential. Database row locks arbitrate payment/expiry/time-confirmation races.

## Verification and deferred work

Commands: `test:appointments:unit`, `test:appointments`, `test:appointments:http`, `test:appointments:scheduler`, plus the existing full regression gate. Native tests require independent PostgreSQL connections and exact deployed migrations; scheduler/HTTP tests use disposable Redis and MongoDB as appropriate. Actual results are recorded in DEVELOPMENT_STATUS.md; a required unexecuted test is not a pass.

Phase 2.6 EHR/encounters/notes/vitals/prescriptions/documents/consent APIs, Phase 2.8 unified BillingRecord/patient bills, historical backfill, production cutover/deployment, real gateway transactions and real SMS are deferred.
