-- Forward-only corrective migration. The two merged migrations remain unchanged.
BEGIN;
ALTER TABLE appointments ADD COLUMN clinical_context_version integer NOT NULL DEFAULT 0;
ALTER TABLE hospital_appointments ADD COLUMN clinical_context_version integer NOT NULL DEFAULT 0;
ALTER TABLE private_clinic_appointments ADD COLUMN clinical_context_version integer NOT NULL DEFAULT 0;
ALTER TABLE consultation_sessions ADD COLUMN hospital_id uuid;
ALTER TABLE consultation_sessions ADD CONSTRAINT consultation_sessions_hospital_id_fkey
 FOREIGN KEY(hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only fill missing organization from the actual referenced parent, never guess it.
UPDATE encounters e SET hospital_id=COALESCE(
 (SELECT a.hospital_id FROM appointments a WHERE a.id=e.appointment_id),
 (SELECT a.hospital_id FROM hospital_appointments a WHERE a.id=e.hospital_appointment_id),
 (SELECT a.clinic_hospital_id FROM private_clinic_appointments a WHERE a.id=e.private_clinic_appointment_id))
 WHERE e.hospital_id IS NULL AND num_nonnulls(e.appointment_id,e.hospital_appointment_id,e.private_clinic_appointment_id)=1;
UPDATE consultation_sessions e SET hospital_id=COALESCE(
 (SELECT a.hospital_id FROM appointments a WHERE a.id=e.appointment_id),
 (SELECT a.hospital_id FROM hospital_appointments a WHERE a.id=e.hospital_appointment_id),
 (SELECT a.clinic_hospital_id FROM private_clinic_appointments a WHERE a.id=e.private_clinic_appointment_id))
 WHERE num_nonnulls(e.appointment_id,e.hospital_appointment_id,e.private_clinic_appointment_id)=1;

CREATE FUNCTION assert_clinical_appointment_context(child jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p jsonb; domain text; parent_id uuid; org uuid;
BEGIN
 IF num_nonnulls(child->>'appointment_id',child->>'hospital_appointment_id',child->>'private_clinic_appointment_id')=0 THEN RETURN; END IF;
 IF child->>'appointment_id' IS NOT NULL THEN domain:='appointments';parent_id:=(child->>'appointment_id')::uuid;
 ELSIF child->>'hospital_appointment_id' IS NOT NULL THEN domain:='hospital_appointments';parent_id:=(child->>'hospital_appointment_id')::uuid;
 ELSE domain:='private_clinic_appointments';parent_id:=(child->>'private_clinic_appointment_id')::uuid; END IF;
 EXECUTE format('SELECT to_jsonb(a) FROM %I a WHERE id=$1',domain) INTO p USING parent_id;
 IF p IS NULL THEN RAISE EXCEPTION 'Clinical appointment parent is missing' USING ERRCODE='23503'; END IF;
 IF p->>'patient_id' IS NULL OR p->>'doctor_id' IS NULL OR
   (domain<>'private_clinic_appointments' AND p->>'hospital_id' IS NULL) THEN
  RAISE EXCEPTION 'Incomplete legacy appointment context requires explicit reconciliation' USING ERRCODE='23514';
 END IF;
 org:=CASE WHEN domain='private_clinic_appointments' THEN (p->>'clinic_hospital_id')::uuid ELSE (p->>'hospital_id')::uuid END;
 IF (child->>'patient_id')::uuid IS DISTINCT FROM (p->>'patient_id')::uuid OR
    (child->>'doctor_id')::uuid IS DISTINCT FROM (p->>'doctor_id')::uuid OR
    (child->>'hospital_id')::uuid IS DISTINCT FROM org THEN
  RAISE EXCEPTION 'Clinical patient, doctor and organization must match the referenced appointment' USING ERRCODE='23514';
 END IF;
END $$;

-- Refuse inconsistent existing patient/doctor links rather than silently rewriting identity.
DO $$ DECLARE c jsonb; BEGIN
 FOR c IN SELECT to_jsonb(e) FROM encounters e UNION ALL SELECT to_jsonb(s) FROM consultation_sessions s LOOP
  PERFORM assert_clinical_appointment_context(c);
 END LOOP;
END $$;

CREATE FUNCTION guard_clinical_appointment_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE domain text; parent_id uuid;
BEGIN
 IF NEW.appointment_id IS NOT NULL THEN domain:='appointments';parent_id:=NEW.appointment_id;
 ELSIF NEW.hospital_appointment_id IS NOT NULL THEN domain:='hospital_appointments';parent_id:=NEW.hospital_appointment_id;
 ELSIF NEW.private_clinic_appointment_id IS NOT NULL THEN domain:='private_clinic_appointments';parent_id:=NEW.private_clinic_appointment_id;
 ELSE RETURN NEW; END IF;
 -- A real common-row write protects parent edits even under REPEATABLE READ.
 EXECUTE format('UPDATE %I SET clinical_context_version=clinical_context_version+1 WHERE id=$1',domain) USING parent_id;
 PERFORM assert_clinical_appointment_context(to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER clinical_appointment_context BEFORE INSERT OR UPDATE ON encounters
 FOR EACH ROW EXECUTE FUNCTION guard_clinical_appointment_context();
CREATE TRIGGER clinical_appointment_context BEFORE INSERT OR UPDATE ON consultation_sessions
 FOR EACH ROW EXECUTE FUNCTION guard_clinical_appointment_context();

CREATE FUNCTION retain_linked_appointment_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reference_column text; linked boolean;
BEGIN
 IF (NEW.patient_id,NEW.doctor_id,COALESCE(to_jsonb(NEW)->>'hospital_id',to_jsonb(NEW)->>'clinic_hospital_id')) IS NOT DISTINCT FROM
    (OLD.patient_id,OLD.doctor_id,COALESCE(to_jsonb(OLD)->>'hospital_id',to_jsonb(OLD)->>'clinic_hospital_id')) THEN RETURN NEW; END IF;
 reference_column:=CASE TG_TABLE_NAME WHEN 'appointments' THEN 'appointment_id' WHEN 'hospital_appointments' THEN 'hospital_appointment_id' ELSE 'private_clinic_appointment_id' END;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM encounters WHERE %I=$1 UNION ALL SELECT 1 FROM consultation_sessions WHERE %I=$1)',reference_column,reference_column) INTO linked USING OLD.id;
 IF linked THEN RAISE EXCEPTION 'Linked appointment clinical context is retained; reconcile clinical links explicitly' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retain_linked_context BEFORE UPDATE OF patient_id,doctor_id,hospital_id ON appointments
 FOR EACH ROW EXECUTE FUNCTION retain_linked_appointment_context();
CREATE TRIGGER retain_linked_context BEFORE UPDATE OF patient_id,doctor_id,hospital_id ON hospital_appointments
 FOR EACH ROW EXECUTE FUNCTION retain_linked_appointment_context();
CREATE TRIGGER retain_linked_context BEFORE UPDATE OF patient_id,doctor_id,clinic_hospital_id ON private_clinic_appointments
 FOR EACH ROW EXECUTE FUNCTION retain_linked_appointment_context();

CREATE OR REPLACE FUNCTION booking_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s materialized_appointment_slots; expected_hospital uuid; deadline timestamptz; p jsonb;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.legacy_source_id, NEW.legacy_imported_at, NEW.created_at)
   IS DISTINCT FROM (OLD.legacy_source_id, OLD.legacy_imported_at, OLD.created_at) THEN
  RAISE EXCEPTION 'Booking provenance is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.refund_resolution='PATIENT_APPROVED_TRANSFER' AND
   (NEW.transfer_approved_at IS NULL OR NEW.transfer_approved_by_user_id IS NULL OR
    NEW.transfer_approved_by_user_id IS DISTINCT FROM (SELECT user_id FROM patients WHERE id=NEW.patient_id)) THEN
  RAISE EXCEPTION 'Transfer requires attributable patient approval' USING ERRCODE='23514';
 END IF;
 IF NEW.legacy_source_id IS NOT NULL THEN RETURN NEW; END IF;
 IF NEW.slot_id IS NULL THEN RAISE EXCEPTION 'Operational booking requires a slot' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT s FROM materialized_appointment_slots WHERE id=NEW.slot_id;
 expected_hospital := CASE WHEN TG_TABLE_NAME='hospital_appointments' THEN to_jsonb(NEW)->>'hospital_id'
                          ELSE to_jsonb(NEW)->>'clinic_hospital_id' END;
 IF NEW.doctor_id <> s.doctor_id OR expected_hospital IS DISTINCT FROM s.hospital_id OR
    NEW.slot_start_time <> s.slot_start OR NEW.slot_end_time <> s.slot_end THEN
  RAISE EXCEPTION 'Booking doctor, provider context and times must match slot' USING ERRCODE='23514';
 END IF;
 IF (NEW.appointment_channel='ONLINE' AND s.channel='OFFLINE') OR
    (NEW.appointment_channel='OFFLINE' AND s.channel='ONLINE') THEN
  RAISE EXCEPTION 'Booking source incompatible with slot channel' USING ERRCODE='23514';
 END IF;
 IF NEW.booking_channel='SUPPORT_ASSISTED' AND (NEW.booked_by_user_id IS NULL OR NEW.handled_by_user_id IS NULL) THEN
  RAISE EXCEPTION 'Support action requires attributable booking and handling actors' USING ERRCODE='23514';
 END IF;
 IF NEW.policy_snapshot IS NULL OR jsonb_typeof(NEW.policy_snapshot)<>'object' THEN
  RAISE EXCEPTION 'Operational booking requires frozen policy snapshot' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND NEW.slot_id IS NOT DISTINCT FROM OLD.slot_id THEN
  IF (NEW.appointment_channel,NEW.booking_channel) IS DISTINCT FROM (OLD.appointment_channel,OLD.booking_channel) THEN
   RAISE EXCEPTION 'Same-slot booking channel and source are immutable; genuinely reschedule instead' USING ERRCODE='23514';
  END IF;
  IF NEW.hold_expires_at IS DISTINCT FROM OLD.hold_expires_at AND EXISTS
    (SELECT 1 FROM appointment_slot_reservations WHERE slot_id=OLD.slot_id AND
      ((TG_TABLE_NAME='hospital_appointments' AND hospital_appointment_id=OLD.id) OR
       (TG_TABLE_NAME='private_clinic_appointments' AND private_clinic_appointment_id=OLD.id))) THEN
   RAISE EXCEPTION 'Existing reservation freezes the booking hold deadline' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='INSERT' THEN NEW.booked_at := clock_timestamp();
 ELSIF NEW.slot_id IS DISTINCT FROM OLD.slot_id THEN NEW.booked_at := clock_timestamp();
 ELSIF NEW.booked_at IS DISTINCT FROM OLD.booked_at OR NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot THEN
  RAISE EXCEPTION 'Booking timestamp and policy snapshot are immutable until rescheduling' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' OR NEW.slot_id IS DISTINCT FROM OLD.slot_id THEN
  IF s.state IN ('BLOCKED','EXPIRED') THEN RAISE EXCEPTION 'Slot is not bookable' USING ERRCODE='23514'; END IF;
  IF NEW.appointment_channel='ONLINE' THEN
   p := NEW.policy_snapshot;
   deadline := appointment_payment_deadline(s.slot_start, NEW.booked_at,
    COALESCE((p->>'paymentHoldWindowMinutes')::int,60), COALESCE((p->>'safetyCutoffMinutes')::int,10),
    COALESCE((p->>'fastConfirmThresholdMinutes')::int,20), COALESCE((p->>'fastConfirmWindowMinutes')::int,5),
    COALESCE((p->>'minimumOnlineLeadMinutes')::int,10));
   IF deadline IS NULL THEN RAISE EXCEPTION 'Online booking is closed' USING ERRCODE='23514'; END IF;
   IF NEW.payment_hold_status IN ('PENDING','HELD') THEN NEW.hold_expires_at := deadline; END IF;
   IF TG_TABLE_NAME='private_clinic_appointments' AND
     ((to_jsonb(NEW)->>'deposit_percentage')::numeric <> 50 OR NEW.deposit_amount <> round(NEW.total_fee*0.50,2)) THEN
    RAISE EXCEPTION 'Clinic online deposit must be 50 percent' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 IF NEW.appointment_channel='ONLINE' THEN
  p := NEW.policy_snapshot;
  deadline := appointment_payment_deadline(s.slot_start, NEW.booked_at,
   COALESCE((p->>'paymentHoldWindowMinutes')::int,60), COALESCE((p->>'safetyCutoffMinutes')::int,10),
   COALESCE((p->>'fastConfirmThresholdMinutes')::int,20), COALESCE((p->>'fastConfirmWindowMinutes')::int,5),
   COALESCE((p->>'minimumOnlineLeadMinutes')::int,10));
  IF deadline IS NULL OR (NEW.hold_expires_at IS NOT NULL AND NEW.hold_expires_at > deadline) OR
    (NEW.payment_hold_status IN ('PENDING','HELD') AND NEW.hold_expires_at IS NULL) THEN
   RAISE EXCEPTION 'Online hold must respect the original frozen policy deadline' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='private_clinic_appointments' AND
    ((to_jsonb(NEW)->>'deposit_percentage')::numeric <> 50 OR NEW.deposit_amount <> round(NEW.total_fee*0.50,2)) THEN
   RAISE EXCEPTION 'Clinic online deposit must remain 50 percent on every update' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.status IN ('cancelled','expired','rescheduled','completed') THEN
  UPDATE appointment_slot_reservations SET status='RELEASED', released_at=clock_timestamp()
   WHERE status IN ('HELD','CONFIRMED') AND
     ((TG_TABLE_NAME='hospital_appointments' AND hospital_appointment_id=NEW.id) OR
      (TG_TABLE_NAME='private_clinic_appointments' AND private_clinic_appointment_id=NEW.id));
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION reservation_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s materialized_appointment_slots; b jsonb;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reservation history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.slot_id,NEW.hospital_appointment_id,NEW.private_clinic_appointment_id,NEW.seat_number,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM (OLD.id,OLD.slot_id,OLD.hospital_appointment_id,OLD.private_clinic_appointment_id,OLD.seat_number,OLD.created_at,OLD.expires_at) THEN
   RAISE EXCEPTION 'Reservation identity is immutable; release and create a new reservation' USING ERRCODE='23514';
  END IF;
  IF OLD.status IN ('RELEASED','EXPIRED') OR (OLD.status='CONFIRMED' AND NEW.status='HELD') THEN
   RAISE EXCEPTION 'Released or expired reservation cannot be reclaimed' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.hospital_appointment_id IS NOT NULL THEN
  SELECT to_jsonb(a) INTO STRICT b FROM hospital_appointments a WHERE id=NEW.hospital_appointment_id FOR UPDATE;
 ELSE
  SELECT to_jsonb(a) INTO STRICT b FROM private_clinic_appointments a WHERE id=NEW.private_clinic_appointment_id FOR UPDATE;
 END IF;
 SELECT * INTO STRICT s FROM materialized_appointment_slots WHERE id=NEW.slot_id FOR UPDATE;
 IF NEW.seat_number > s.capacity OR (b->>'slot_id')::uuid <> s.id THEN
  RAISE EXCEPTION 'Reservation capacity or booking slot mismatch' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.status IN ('HELD','CONFIRMED') AND EXISTS
   (SELECT 1 FROM appointment_slot_reservations r WHERE r.slot_id=NEW.slot_id AND
     (r.hospital_appointment_id,r.private_clinic_appointment_id) IS NOT DISTINCT FROM
     (NEW.hospital_appointment_id,NEW.private_clinic_appointment_id) AND
     r.expires_at > (b->>'booked_at')::timestamptz AND r.expires_at <= clock_timestamp()) THEN
  RAISE EXCEPTION 'Expired booking hold cannot be replaced in the same booking epoch' USING ERRCODE='23514';
 END IF;
 IF NEW.status IN ('HELD','CONFIRMED') THEN
  IF b->>'status' IN ('cancelled','expired','rescheduled','completed') OR s.state IN ('BLOCKED','EXPIRED') THEN
   RAISE EXCEPTION 'Inactive booking cannot reserve capacity' USING ERRCODE='23514'; END IF;
  IF NEW.status='HELD' AND (NEW.expires_at IS DISTINCT FROM (b->>'hold_expires_at')::timestamptz OR NEW.expires_at <= clock_timestamp()) THEN
   RAISE EXCEPTION 'Payment hold must use valid booking deadline' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND NEW.status='CONFIRMED' AND OLD.status='HELD' AND OLD.expires_at <= clock_timestamp() THEN
   RAISE EXCEPTION 'Late payment cannot reclaim expired capacity' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

-- Fail the migration on known pre-existing policy violations; do not rewrite money or deadlines.
DO $$ DECLARE b jsonb; deadline timestamptz; BEGIN
 FOR b IN SELECT to_jsonb(a) FROM hospital_appointments a WHERE legacy_source_id IS NULL AND appointment_channel='ONLINE'
 UNION ALL SELECT to_jsonb(a) FROM private_clinic_appointments a WHERE legacy_source_id IS NULL AND appointment_channel='ONLINE' LOOP
  deadline:=appointment_payment_deadline((b->>'slot_start_time')::timestamptz,(b->>'booked_at')::timestamptz,
   COALESCE((b->'policy_snapshot'->>'paymentHoldWindowMinutes')::int,60),COALESCE((b->'policy_snapshot'->>'safetyCutoffMinutes')::int,10),
   COALESCE((b->'policy_snapshot'->>'fastConfirmThresholdMinutes')::int,20),COALESCE((b->'policy_snapshot'->>'fastConfirmWindowMinutes')::int,5),
   COALESCE((b->'policy_snapshot'->>'minimumOnlineLeadMinutes')::int,10));
  IF deadline IS NULL OR (b->>'hold_expires_at')::timestamptz>deadline OR
    (b->>'payment_hold_status' IN ('PENDING','HELD') AND b->>'hold_expires_at' IS NULL) OR
    (b ? 'deposit_percentage' AND ((b->>'deposit_percentage')::numeric<>50 OR (b->>'deposit_amount')::numeric<>round((b->>'total_fee')::numeric*0.5,2))) THEN
   RAISE EXCEPTION 'Existing online policy violation requires explicit reconciliation before migration' USING ERRCODE='23514';
  END IF;
 END LOOP;
END $$;
COMMIT;
