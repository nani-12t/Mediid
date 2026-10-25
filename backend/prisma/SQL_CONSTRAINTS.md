# Phase 1.3.1 executable database protections

MongoDB remains operationally primary. Phase 1.3.1 and merged Phase 2.1 are complete; Phase 2.2A adds isolated authentication services and test-only integration without operational cutover.

## Executable migration order

1. migrations/202610190001_phase131_baseline/migration.sql creates the complete validated Prisma schema in an empty database, including vector and btree_gist.
2. migrations/202610190002_phase131_constraints/migration.sql installs all handwritten checks, exclusions, triggers and partial indexes. It must match constraints.sql exactly; tests verify equality.
3. migrations/202610200001_phase131_review/migration.sql is the forward corrective migration for clinical context and same-slot policy checks. The original two migration files and constraints.sql remain unchanged.
4. migrations/202610200002_phase21_infrastructure_permissions/migration.sql grants isolated infrastructure metadata access after administrator role setup; deploy through Prisma so its history table exists.
5. migrations/202610200003_phase22a_auth_identity/migration.sql adds canonical identities, hashed reset storage and narrowly scoped auth/ownership/membership permissions. See AUTH_FOUNDATION.md.
6. Development setup deploys all five in order; the Phase 1.3.1 regression gate executes the first three exact files. Existing PostgreSQL installations require a reviewed reconciliation and conflict audit, not replay of the empty baseline. Do not replace migrations with schema push, which omits essential SQL protections.

Tests execute these exact files in a fresh in-memory PGlite PostgreSQL instance with vector and btree_gist. They never read DATABASE_URL or connect to installed services or production. PGlite uses the PostgreSQL engine, but does not test independently executing database sessions. Independent-connection seat/refund/context tests also run in a fresh native PostgreSQL cluster when initdb/pg_ctl are available. The native runner reports NOT EXECUTED when unavailable; this is a Phase 2.1 gate. Native verification now requires real pgvector and never removes extension declarations. The former exact-native gate was closed on PostgreSQL 18.4 with vector 0.8.2 and btree_gist 1.8; all three merged files executed unchanged.

## Enforced invariants

| Area | Executable protection |
| --- | --- |
| Overlap | GiST exclusion across doctor_id and half-open tstzrange(slot_start,slot_end), for every non-EXPIRED slot across hospital/clinic contexts. Adjacent slots are allowed. |
| Slot bounds | slotStart < slotEnd, positive capacity, nonnegative version/reopen count. Identity/times/channel cannot change after reservation history exists. Occupied capacity cannot shrink or be blocked. |
| Capacity | Retained reservations own numbered seats. Partial unique indexes prevent duplicate active slot/seat claims and multiple active reservations per booking. A slot-row lock validates seatNumber against capacity. |
| Lifecycle | HELD requires the booking deadline and a future expiry. Released/expired reservations cannot be reclaimed. A late HELD-to-CONFIRMED update fails. Reservation identity is immutable and deletion is blocked. |
| Booking consistency | Operational bookings require matching slot doctor, organization, exact timestamps, policy snapshot and an own active reservation at transaction commit. Cancellation/expiry/completion/rescheduling releases only that booking's reservations. |
| Channels | Slot channel is ONLINE/OFFLINE/FLEXIBLE. Appointment channel selects ONLINE/OFFLINE independently of app, phone, walk-in or support booking source. |
| Encounters | num_nonnulls(appointment_id,hospital_appointment_id,private_clinic_appointment_id) <= 1 allows direct/emergency care and rejects mixed domains. Consultation sessions have the same check. |
| Finance | Exactly one domain owner, positive Decimal amounts, uppercase currency, unique idempotency and provider transaction references. Captured/successful transactions require provider references. |
| Refunds | Refunds match a captured payment's owner, currency and provider. Pending/processing/successful allocations consume an atomic database-owned refundAllocated counter. Failed requests release allocation. The conditional parent UPDATE cannot exceed captured amount and serializes competing transactions, including stricter isolation levels. |
| Retention | Financial identity/amounts are immutable. Terminal statuses cannot be rewritten. Before/after snapshots record every change. Deletes, bulk truncation, event editing and forged audit inserts fail. Financial FKs use Restrict. |
| Actors | Support-assisted bookings require booking/handling actor FKs. Reservations and financial actions require actor IDs. Transfer credit requires attributable approval from the patient's own user. |

## Transaction contract

Create the appointment and its reservation in one transaction. Deferred triggers validate the final state. HELD/CONFIRMED are active reservations. Expiring the appointment releases only its own reservation; refund processing is independent and cannot delay release. Time expiration is explicit state, never a volatile unique-index predicate.

For rescheduling, release the old reservation, change the slot/timestamps, take a fresh policy snapshot/deadline, and insert a new reservation atomically. Booking time is generated by the database for each new booking/slot assignment. Retry serialization/deadlock failures. Released history is retained. A late payment records the capture but never assigns capacity; the patient needs refund/reconciliation rather than reclaiming a reassigned slot.

## Policies and deadlines

Both provider models default to normal payment window 60 minutes, safety cutoff 10, fast threshold 20, fast payment window 5 and minimum online lead 10. Hospital confirmation lead defaults to configurable 40 minutes. Private-clinic online deposit is 50 percent. The SQL appointment_payment_deadline function returns min(bookingTime + applicableWindow, slotStart - safetyCutoff), or NULL if booking is closed or the hold would be nonpositive. Exactly ten minutes remaining is closed. Online inserts calculate the deadline from the frozen policy; HELD reservations must match it.

For a 14:00 slot: 13:20 gives 13:50; 13:43 gives 13:48; 13:48 gives 13:50; 13:50 is closed.

Cancellation cutoff, normal/late/no-show refund percentages, rescheduling cutoff/count, and transfer availability are typed fields. cancellationRules holds additional structured provider rules. It must not override provider cancellation's typed full-refund guarantee. refundResolution defaults to REFUND; PATIENT_APPROVED_TRANSFER requires the patient's own actor and approval timestamp. Financial execution and policy evaluation remain future services, not new mounted API routes.

## Legacy and access boundaries

Public MEDIID IDs and the frozen deterministic UUIDv5 namespace are unchanged. Historical appointments without reliable timestamps stay in the legacy appointments table; never invent times or fictitious reservations. Reliable historical domain imports without reservations require both original 24-hex legacySourceId and legacyImportedAt. These are immutable and reserved for the migration writer. Future runtime roles must not be allowed to manufacture migration provenance or own/alter schema objects.

Hospital front desk stays scoped to its hospital. Private-clinic scheduling is doctor-owned, with no receptionist role. Support receives attributable scheduling/billing assistance, not unrestricted EHR access. Role provisioning and authorization enforcement remain future-phase work. Existing MongoDB API responses remain unchanged.

References: [PostgreSQL ranges/exclusion](https://www.postgresql.org/docs/current/rangetypes.html), [Prisma v6 migration workflow](https://www.prisma.io/docs/orm/v6/prisma-migrate/getting-started), [PGlite extensions](https://pglite.dev/extensions/).

## Forward review correction (2026-10-20)

Execute the original baseline, original constraints, then 202610200001_phase131_review. Never edit either merged migration or replay constraints.sql as the final specification; the forward migration replaces the affected functions. The entire correction runs in one transaction. It fails on existing patient/doctor/context mismatches or known online policy violations instead of silently rewriting identity, money or deadlines. Existing missing organization fields are filled only from the authoritative referenced appointment; independent-clinic NULL stays NULL. Past channel/source changes cannot be reconstructed and require a separate historical audit.

Encounter and ConsultationSession INSERT/UPDATE now match the referenced legacy/hospital/clinic appointment's patient, doctor and organization. ConsultationSession gains nullable hospitalId so its organization can be checked. Parent context edits are rejected while either clinical table references the appointment. A database-written clinicalContextVersion counter on the parent makes clinical-link creation contend with parent edits even at REPEATABLE READ. It is serialization metadata, not a new appointment or encounter count. Existing zero-or-one appointment reference checks are unchanged; zero-reference direct encounters and multiple encounters per appointment remain valid.

Legacy appointment patient/doctor/hospital columns are already required by the merged schema. The correction explicitly rejects incomplete required parent context rather than guessing. Missing historical times remain unknown in the legacy record; no timestamps or organizations are fabricated. Private-clinic organization NULL is an explicit independent-clinic context, not an unknown hospital.

Every operational ONLINE clinic update now enforces 50 percent deposit against the current fee. Same-slot edits retain the original booking time, snapshot, channel/source and reserved deadline. A consistent paired fee/deposit update remains valid. Genuine slot changes may take a new booking timestamp, snapshot and computed deadline atomically with replacement reservation creation. New reservations cannot use an expired hold from the same booking epoch, including a direct fresh CONFIRMED reservation. Offline fee/deposit edits remain permitted within existing numeric bounds.

Reproduction command: npm run test:review:reproduce (only original migrations). Corrective command: npm run test:review (all three unchanged migration files in order). Native command: npm run test:review:native (new loopback-only cluster, independent connections, then shutdown; never reads DATABASE_URL). Set MEDIID_TEST_PG_BIN to the PostgreSQL binary directory if needed.

## Phase 2.1 verification closure

The exact native gate passes all 27 schema and 70 review checks with both real extensions. Four independent-connection races also pass without SQL rewriting. The original three migrations and constraints.sql remain unchanged. The new infrastructure permission migration grants only metadata access to runtime/diagnostics; no business repository access is enabled. See DEVELOPMENT.md for provisioning, credentials, migration deployment and lifecycle commands. Reservation deadlines must be copied from the stored booking inside SQL, preserving timestamptz(6) microseconds rather than round-tripping through JavaScript Date.

Phase 2.2B forward execution order (the five historical migrations remain unchanged):

6. `202610240001_phase22b_sessions`: sessions, refresh families/digests, auth-version invalidation, explicit compatibility metadata and patient-only runtime registration guard.
7. `202610240002_phase22b_provisioning`: doctor activation, attributable hospital memberships and explicit staff identity link with scoped SECURITY DEFINER operations.

Deploy all seven directories in lexical order through the existing separate migrator credential. Do not concatenate or reapply merged migrations; existing databases require the normal Prisma migration ledger. See AUTH_HARDENING.md for current grants and limitations.
