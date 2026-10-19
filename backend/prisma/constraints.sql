-- Phase 1.3.1. Apply after the complete Prisma-generated baseline, in one transaction.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE materialized_appointment_slots
  ADD CONSTRAINT slot_bounds CHECK (slot_start < slot_end AND capacity > 0 AND version >= 0 AND reopened_count >= 0),
  ADD CONSTRAINT doctor_active_slots_no_overlap EXCLUDE USING gist
    (doctor_id WITH =, tstzrange(slot_start, slot_end, '[)') WITH &&)
    WHERE (state <> 'EXPIRED');
ALTER TABLE encounters ADD CONSTRAINT encounter_one_appointment
  CHECK (num_nonnulls(appointment_id, hospital_appointment_id, private_clinic_appointment_id) <= 1);
ALTER TABLE consultation_sessions ADD CONSTRAINT consultation_one_appointment
  CHECK (num_nonnulls(appointment_id, hospital_appointment_id, private_clinic_appointment_id) <= 1);
ALTER TABLE appointment_slot_reservations
  ADD CONSTRAINT reservation_one_owner CHECK (num_nonnulls(hospital_appointment_id, private_clinic_appointment_id) = 1),
  ADD CONSTRAINT reservation_bounds CHECK (seat_number > 0 AND
    (status <> 'HELD' OR (expires_at IS NOT NULL AND expires_at > created_at)) AND
    ((status IN ('RELEASED','EXPIRED')) = (released_at IS NOT NULL)));
CREATE UNIQUE INDEX reservation_active_seat ON appointment_slot_reservations(slot_id, seat_number)
  WHERE status IN ('HELD','CONFIRMED');
CREATE UNIQUE INDEX reservation_active_hospital_booking ON appointment_slot_reservations(hospital_appointment_id)
  WHERE status IN ('HELD','CONFIRMED');
CREATE UNIQUE INDEX reservation_active_clinic_booking ON appointment_slot_reservations(private_clinic_appointment_id)
  WHERE status IN ('HELD','CONFIRMED');
ALTER TABLE appointment_payments
  ADD CONSTRAINT payment_one_owner CHECK (num_nonnulls(hospital_appointment_id, private_clinic_appointment_id) = 1),
  ADD CONSTRAINT payment_bounds CHECK (refund_allocated BETWEEN 0 AND amount AND amount > 0 AND amount <> 'NaN'::numeric AND currency ~ '^[A-Z]{3}$' AND
    length(trim(provider)) > 0 AND length(trim(idempotency_key)) > 0 AND
    ((status = 'CAPTURED') = (captured_at IS NOT NULL)) AND
    (status <> 'CAPTURED' OR (provider_transaction_ref IS NOT NULL AND length(trim(provider_transaction_ref)) > 0)));
ALTER TABLE appointment_refunds
  ADD CONSTRAINT refund_one_owner CHECK (num_nonnulls(hospital_appointment_id, private_clinic_appointment_id) = 1),
  ADD CONSTRAINT refund_bounds CHECK (amount > 0 AND amount <> 'NaN'::numeric AND currency ~ '^[A-Z]{3}$' AND
    length(trim(provider)) > 0 AND length(trim(idempotency_key)) > 0 AND
    (status <> 'SUCCEEDED' OR (provider_transaction_ref IS NOT NULL AND length(trim(provider_transaction_ref)) > 0)));
ALTER TABLE appointment_financial_events ADD CONSTRAINT financial_event_one_source
  CHECK (num_nonnulls(payment_id, refund_id) = 1);

-- NULL return means closed. Boundary at ten minutes is closed, never a zero hold.
CREATE FUNCTION appointment_payment_deadline(slot_start timestamptz, booking_time timestamptz,
 normal_window integer DEFAULT 60, safety integer DEFAULT 10, fast_threshold integer DEFAULT 20,
 fast_window integer DEFAULT 5, minimum_lead integer DEFAULT 10)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE result timestamptz;
BEGIN
 IF normal_window <= 0 OR fast_window <= 0 OR safety < 10 OR minimum_lead < 10 OR fast_threshold < minimum_lead THEN
  RAISE EXCEPTION 'Invalid payment deadline policy' USING ERRCODE='23514';
 END IF;
 IF slot_start - booking_time <= make_interval(mins => minimum_lead) THEN RETURN NULL; END IF;
 result := LEAST(booking_time + make_interval(mins => CASE WHEN slot_start - booking_time <= make_interval(mins => fast_threshold)
                  THEN fast_window ELSE normal_window END), slot_start - make_interval(mins => safety));
 IF result <= booking_time THEN RETURN NULL; END IF;
 RETURN result;
END $$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['hospital_scheduling_rules','doctor_clinic_policies'] LOOP
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT policy_bounds CHECK (
    payment_hold_window_minutes > 0 AND fast_confirm_window_minutes > 0 AND safety_cutoff_minutes >= 10 AND
    minimum_online_lead_minutes >= 10 AND fast_confirm_threshold_minutes >= minimum_online_lead_minutes AND
    confirmation_lead_minutes >= 0 AND deposit_percentage BETWEEN 0 AND 100 AND
    patient_refund_percentage BETWEEN 0 AND 100 AND late_refund_percentage BETWEEN 0 AND 100 AND
    provider_refund_percentage = 100 AND no_show_refund_percentage BETWEEN 0 AND 100 AND
    cancellation_cutoff_hours >= 0 AND reschedule_cutoff_hours >= 0 AND max_reschedule_count >= 0 AND
    jsonb_typeof(cancellation_rules) = ''object'')', t);
 END LOOP;
END $$;
ALTER TABLE hospital_scheduling_rules ADD CONSTRAINT hospital_deposit_bounds CHECK (deposit_fixed_amount >= 0);
ALTER TABLE doctor_clinic_policies ADD CONSTRAINT clinic_policy_deposit CHECK (deposit_percentage = 50 AND no_show_fee_deduction BETWEEN 0 AND 100);

CREATE FUNCTION protect_materialized_slot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM appointment_slot_reservations WHERE slot_id=OLD.id) AND
    (NEW.doctor_id, NEW.hospital_id, NEW.slot_start, NEW.slot_end, NEW.channel)
       IS DISTINCT FROM (OLD.doctor_id, OLD.hospital_id, OLD.slot_start, OLD.slot_end, OLD.channel) THEN
  RAISE EXCEPTION 'Slot identity and times are retained after first reservation' USING ERRCODE='23514';
 END IF;
 IF EXISTS (SELECT 1 FROM appointment_slot_reservations WHERE slot_id=OLD.id AND status IN ('HELD','CONFIRMED')
             AND (seat_number > NEW.capacity OR NEW.state IN ('EXPIRED','BLOCKED'))) THEN
  RAISE EXCEPTION 'Cannot remove occupied capacity' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_materialized_slot BEFORE UPDATE ON materialized_appointment_slots
 FOR EACH ROW EXECUTE FUNCTION protect_materialized_slot();

CREATE FUNCTION booking_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
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
 IF NEW.status IN ('cancelled','expired','rescheduled','completed') THEN
  UPDATE appointment_slot_reservations SET status='RELEASED', released_at=clock_timestamp()
   WHERE status IN ('HELD','CONFIRMED') AND
     ((TG_TABLE_NAME='hospital_appointments' AND hospital_appointment_id=NEW.id) OR
      (TG_TABLE_NAME='private_clinic_appointments' AND private_clinic_appointment_id=NEW.id));
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION reservation_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER reservation_integrity BEFORE INSERT OR UPDATE OR DELETE ON appointment_slot_reservations
 FOR EACH ROW EXECUTE FUNCTION reservation_integrity();

-- Deferred to permit appointment + reservation creation/rescheduling in one transaction.
CREATE FUNCTION booking_requires_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b jsonb; owner uuid; domain text;
BEGIN
 IF TG_TABLE_NAME='appointment_slot_reservations' THEN
  owner := COALESCE(NEW.hospital_appointment_id,NEW.private_clinic_appointment_id);
  domain := CASE WHEN NEW.hospital_appointment_id IS NOT NULL THEN 'hospital_appointments' ELSE 'private_clinic_appointments' END;
 ELSE owner := NEW.id; domain := TG_TABLE_NAME; END IF;
 EXECUTE format('SELECT to_jsonb(a) FROM %I a WHERE id=$1',domain) INTO b USING owner;
 IF b IS NULL OR b->>'legacy_source_id' IS NOT NULL OR b->>'status' IN ('cancelled','expired','rescheduled','completed') THEN RETURN NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM appointment_slot_reservations r WHERE r.slot_id=(b->>'slot_id')::uuid
   AND ((domain='hospital_appointments' AND r.hospital_appointment_id=owner) OR
        (domain='private_clinic_appointments' AND r.private_clinic_appointment_id=owner))
   AND r.status IN ('HELD','CONFIRMED')) THEN
  RAISE EXCEPTION 'Operational booking must own an active reservation' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['hospital_appointments','private_clinic_appointments'] LOOP
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT booking_numeric_bounds CHECK
   (appointment_channel <> ''FLEXIBLE'' AND slot_start_time < slot_end_time AND total_fee >= 0 AND deposit_amount BETWEEN 0 AND total_fee AND
    amount_paid >= 0 AND refund_amount >= 0 AND refund_amount <= amount_paid AND currency ~ ''^[A-Z]{3}$'' AND
    reschedule_count >= 0 AND ''NaN''::numeric <> ALL(ARRAY[total_fee,deposit_amount,amount_paid,refund_amount]) AND (hold_expires_at IS NULL OR hold_expires_at > booked_at) AND
    (num_nonnulls(legacy_source_id,legacy_imported_at) IN (0,2) AND (legacy_source_id IS NULL OR
     (legacy_source_id ~ ''^[a-f0-9]{24}$'' AND legacy_imported_at IS NOT NULL))))',t);
  EXECUTE format('CREATE TRIGGER booking_integrity BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION booking_integrity()',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER booking_requires_reservation AFTER INSERT OR UPDATE ON %I
   DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION booking_requires_reservation()',t);
 END LOOP;
END $$;
CREATE CONSTRAINT TRIGGER reservation_keeps_booking_consistent AFTER INSERT OR UPDATE ON appointment_slot_reservations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION booking_requires_reservation();

CREATE FUNCTION financial_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p appointment_payments; owner_currency text; delta numeric;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Financial history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='appointment_payments' THEN
  IF TG_OP='INSERT' AND NEW.refund_allocated <> 0 THEN
   RAISE EXCEPTION 'Refund budget is database-owned' USING ERRCODE='23514';
  ELSIF TG_OP='UPDATE' AND pg_trigger_depth() >= 2 AND
    (to_jsonb(NEW)-'refund_allocated') = (to_jsonb(OLD)-'refund_allocated') THEN
   RETURN NEW;
  END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW) - ARRAY['status','actor_user_id','provider_transaction_ref','captured_at']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','actor_user_id','provider_transaction_ref','captured_at']) OR
     (OLD.provider_transaction_ref IS NOT NULL AND NEW.provider_transaction_ref IS DISTINCT FROM OLD.provider_transaction_ref) THEN
   RAISE EXCEPTION 'Financial identity and amounts are immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='appointment_payments' THEN
   IF OLD.status IN ('CAPTURED','FAILED') OR (OLD.status='AUTHORIZED' AND NEW.status NOT IN ('CAPTURED','FAILED')) THEN
    RAISE EXCEPTION 'Invalid payment transition' USING ERRCODE='23514'; END IF;
  ELSE
   IF OLD.status IN ('SUCCEEDED','FAILED') OR (OLD.status='PROCESSING' AND NEW.status NOT IN ('SUCCEEDED','FAILED')) THEN
    RAISE EXCEPTION 'Invalid refund transition' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF NEW.hospital_appointment_id IS NOT NULL THEN
  SELECT currency INTO STRICT owner_currency FROM hospital_appointments WHERE id=NEW.hospital_appointment_id;
 ELSE SELECT currency INTO STRICT owner_currency FROM private_clinic_appointments WHERE id=NEW.private_clinic_appointment_id; END IF;
 IF NEW.currency <> owner_currency THEN RAISE EXCEPTION 'Financial currency differs from booking' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='appointment_refunds' THEN
  -- This common parent row serializes all competing partial refund requests.
  SELECT * INTO STRICT p FROM appointment_payments WHERE id=NEW.payment_id FOR UPDATE;
  IF p.status<>'CAPTURED' OR p.currency<>NEW.currency OR p.provider<>NEW.provider OR
     (p.hospital_appointment_id,p.private_clinic_appointment_id) IS DISTINCT FROM
     (NEW.hospital_appointment_id,NEW.private_clinic_appointment_id) THEN
   RAISE EXCEPTION 'Refund must belong to its captured payment and appointment' USING ERRCODE='23514'; END IF;
  delta := CASE WHEN NEW.status<>'FAILED' THEN NEW.amount ELSE 0 END;
  IF TG_OP='UPDATE' AND OLD.status<>'FAILED' THEN delta := delta-OLD.amount; END IF;
  -- An actual parent UPDATE also serializes REPEATABLE READ/SERIALIZABLE snapshots.
  UPDATE appointment_payments SET refund_allocated=refund_allocated+delta
    WHERE id=p.id AND refund_allocated+delta BETWEEN 0 AND amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund allocation exceeds captured amount' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_integrity BEFORE INSERT OR UPDATE OR DELETE ON appointment_payments FOR EACH ROW EXECUTE FUNCTION financial_integrity();
CREATE TRIGGER refund_integrity BEFORE INSERT OR UPDATE OR DELETE ON appointment_refunds FOR EACH ROW EXECUTE FUNCTION financial_integrity();
CREATE FUNCTION record_financial_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO appointment_financial_events(payment_id,refund_id,before,after)
 VALUES(CASE WHEN TG_TABLE_NAME='appointment_payments' THEN NEW.id END,
        CASE WHEN TG_TABLE_NAME='appointment_refunds' THEN NEW.id END,
        CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW));
 RETURN NULL;
END $$;
CREATE TRIGGER payment_history AFTER INSERT OR UPDATE ON appointment_payments FOR EACH ROW EXECUTE FUNCTION record_financial_event();
CREATE TRIGGER refund_history AFTER INSERT OR UPDATE ON appointment_refunds FOR EACH ROW EXECUTE FUNCTION record_financial_event();
CREATE FUNCTION retain_financial_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Financial audit history is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER retain_financial_event BEFORE UPDATE OR DELETE ON appointment_financial_events FOR EACH ROW EXECUTE FUNCTION retain_financial_event();

-- Retention also covers bulk deletion, and direct fabricated audit inserts.
CREATE FUNCTION financial_audit_writer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth() < 2 THEN RAISE EXCEPTION 'Financial events are database-generated' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financial_audit_writer BEFORE INSERT ON appointment_financial_events FOR EACH ROW EXECUTE FUNCTION financial_audit_writer();
CREATE TRIGGER retain_payment_bulk BEFORE TRUNCATE ON appointment_payments FOR EACH STATEMENT EXECUTE FUNCTION retain_financial_event();
CREATE TRIGGER retain_refund_bulk BEFORE TRUNCATE ON appointment_refunds FOR EACH STATEMENT EXECUTE FUNCTION retain_financial_event();
CREATE TRIGGER retain_financial_event_bulk BEFORE TRUNCATE ON appointment_financial_events FOR EACH STATEMENT EXECUTE FUNCTION retain_financial_event();
CREATE TRIGGER retain_reservation_bulk BEFORE TRUNCATE ON appointment_slot_reservations FOR EACH STATEMENT EXECUTE FUNCTION retain_financial_event();
