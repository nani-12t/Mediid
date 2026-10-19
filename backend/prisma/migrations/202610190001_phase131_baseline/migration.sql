-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('patient', 'hospital_admin', 'doctor', 'buyer', 'pharmacy', 'support_agent');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('government', 'private', 'trust', 'clinic');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('nurse', 'receptionist', 'lab_technician', 'pharmacist', 'ward_boy', 'security', 'administrator', 'radiologist', 'physiotherapist', 'other');

-- CreateEnum
CREATE TYPE "DoctorStatus" AS ENUM ('available', 'busy', 'on_leave', 'offline');

-- CreateEnum
CREATE TYPE "SlotScheduleType" AS ENUM ('date', 'day');

-- CreateEnum
CREATE TYPE "SlotChannel" AS ENUM ('ONLINE', 'OFFLINE', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "SlotState" AS ENUM ('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "HospitalConfirmationMode" AS ENUM ('DEPOSIT', 'TIME_BASED', 'MANUAL');

-- CreateEnum
CREATE TYPE "OverrideType" AS ENUM ('LEAVE', 'EMERGENCY_BLOCK', 'CUSTOM_HOURS', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "BookingChannel" AS ENUM ('ONLINE_APP', 'WALK_IN', 'PHONE', 'SUPPORT_ASSISTED');

-- CreateEnum
CREATE TYPE "PaymentHoldStatus" AS ENUM ('NONE', 'PENDING', 'HELD', 'PAID', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CancellationInitiator" AS ENUM ('PATIENT', 'DOCTOR', 'HOSPITAL_FRONT_DESK', 'SUPPORT_AGENT', 'SYSTEM_AUTO_EXPIRE');

-- CreateEnum
CREATE TYPE "RescheduleInitiator" AS ENUM ('PATIENT', 'DOCTOR', 'HOSPITAL_FRONT_DESK', 'SUPPORT_AGENT');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'COMPLETED', 'FAILED', 'REJECTED', 'TRANSFER_CREDIT_OFFERED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "BloodGroup" AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('pending', 'reminder_sent', 'confirmed', 'checked_in', 'completed', 'expired', 'cancelled', 'rescheduled');

-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "EncounterType" AS ENUM ('ambulatory', 'emergency', 'inpatient', 'virtual');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('prescription', 'scan', 'bill', 'lab_report', 'discharge_summary', 'other');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('pending', 'paid', 'insurance_claimed');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('active', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "DatasetConsentStatus" AS ENUM ('pending', 'granted', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "ApprovedDatasetStatus" AS ENUM ('pending_review', 'approved', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "DeidentificationStatus" AS ENUM ('not_started', 'in_progress', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "DatasetAccessGrantStatus" AS ENUM ('active', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'CONFIRMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AppointmentPaymentStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED');

-- CreateEnum
CREATE TYPE "AppointmentRefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "CancellationRefundResolution" AS ENUM ('REFUND', 'PATIENT_APPROVED_TRANSFER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255),
    "uid" VARCHAR(64),
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "reset_password_token" VARCHAR(32),
    "reset_password_expires_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "uid" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "registration_number" VARCHAR(128),
    "type" "OrganizationType" NOT NULL DEFAULT 'private',
    "street" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "pincode" VARCHAR(20),
    "country" VARCHAR(100) DEFAULT 'India',
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "contact_phone" VARCHAR(32),
    "contact_email" VARCHAR(255),
    "website" VARCHAR(255),
    "emergency_phone" VARCHAR(32),
    "specialties" TEXT[],
    "facilities" TEXT[],
    "operating_hours" JSONB,
    "total_beds" INTEGER DEFAULT 0,
    "icu_beds" INTEGER DEFAULT 0,
    "logo_url" TEXT,
    "photos" TEXT[],
    "rating_average" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "doctor_sequence" INTEGER NOT NULL DEFAULT 0,
    "staff_sequence" INTEGER NOT NULL DEFAULT 0,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hospitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacies" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL DEFAULT 'Hospital Pharmacy',
    "phone" VARCHAR(32),
    "email" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_memberships" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "uid" VARCHAR(64) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "role" "StaffRole" NOT NULL,
    "department" VARCHAR(100),
    "employee_id" VARCHAR(64),
    "qualifications" TEXT[],
    "experience" INTEGER,
    "phone" VARCHAR(32),
    "email" VARCHAR(255),
    "photo_url" TEXT,
    "date_of_joining" DATE,
    "shift" VARCHAR(20) DEFAULT 'morning',
    "status" VARCHAR(20) DEFAULT 'active',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hospital_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "primary_hospital_id" UUID,
    "uid" VARCHAR(64) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "specialization" VARCHAR(150) NOT NULL,
    "sub_specialties" TEXT[],
    "qualifications" TEXT[],
    "experience_years" INTEGER,
    "registration_number" VARCHAR(100),
    "phone" VARCHAR(32),
    "email" VARCHAR(255),
    "photo_url" TEXT,
    "consultation_fee" DECIMAL(10,2) NOT NULL DEFAULT 500.00,
    "expertise" TEXT[],
    "languages" TEXT[],
    "rating_average" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "status" "DoctorStatus" NOT NULL DEFAULT 'available',
    "is_private_practice" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_hospital_memberships" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "role_title" VARCHAR(100) DEFAULT 'Attending Physician',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_hospital_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_slots" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "hospital_id" UUID,
    "schedule_type" "SlotScheduleType" NOT NULL,
    "specific_date" DATE,
    "day_of_week" VARCHAR(16),
    "time_slots" TEXT[],
    "max_bookings" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "doctor_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_scheduling_rules" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "confirmation_mode" "HospitalConfirmationMode" NOT NULL DEFAULT 'TIME_BASED',
    "deposit_required" BOOLEAN NOT NULL DEFAULT false,
    "deposit_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "deposit_fixed_amount" DECIMAL(10,2),
    "payment_hold_window_minutes" INTEGER NOT NULL DEFAULT 60,
    "safety_cutoff_minutes" INTEGER NOT NULL DEFAULT 10,
    "fast_confirm_window_minutes" INTEGER NOT NULL DEFAULT 5,
    "fast_confirm_threshold_minutes" INTEGER NOT NULL DEFAULT 20,
    "minimum_online_lead_minutes" INTEGER NOT NULL DEFAULT 10,
    "confirmation_lead_minutes" INTEGER NOT NULL DEFAULT 40,
    "patient_refund_percentage" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "late_refund_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "provider_refund_percentage" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "allow_patient_approved_transfer" BOOLEAN NOT NULL DEFAULT true,
    "cancellation_rules" JSONB NOT NULL DEFAULT '{}',
    "no_show_refund_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cancellation_cutoff_hours" INTEGER NOT NULL DEFAULT 2,
    "reschedule_cutoff_hours" INTEGER NOT NULL DEFAULT 2,
    "max_reschedule_count" INTEGER NOT NULL DEFAULT 2,
    "refund_policy_notes" TEXT,
    "allow_walk_ins" BOOLEAN NOT NULL DEFAULT true,
    "allow_phone_bookings" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hospital_scheduling_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_clinic_policies" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "deposit_percentage" DECIMAL(5,2) NOT NULL DEFAULT 50.00,
    "payment_hold_window_minutes" INTEGER NOT NULL DEFAULT 60,
    "safety_cutoff_minutes" INTEGER NOT NULL DEFAULT 10,
    "fast_confirm_window_minutes" INTEGER NOT NULL DEFAULT 5,
    "fast_confirm_threshold_minutes" INTEGER NOT NULL DEFAULT 20,
    "minimum_online_lead_minutes" INTEGER NOT NULL DEFAULT 10,
    "confirmation_lead_minutes" INTEGER NOT NULL DEFAULT 40,
    "patient_refund_percentage" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "late_refund_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "provider_refund_percentage" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "allow_patient_approved_transfer" BOOLEAN NOT NULL DEFAULT true,
    "cancellation_rules" JSONB NOT NULL DEFAULT '{}',
    "no_show_refund_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cancellation_cutoff_hours" INTEGER NOT NULL DEFAULT 4,
    "reschedule_cutoff_hours" INTEGER NOT NULL DEFAULT 4,
    "max_reschedule_count" INTEGER NOT NULL DEFAULT 1,
    "no_show_fee_deduction" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "refund_policy_notes" TEXT,
    "allow_phone_bookings" BOOLEAN NOT NULL DEFAULT true,
    "allow_walk_ins" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "doctor_clinic_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_availability_templates" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "hospital_id" UUID,
    "day_of_week" VARCHAR(16) NOT NULL,
    "start_time" VARCHAR(10) NOT NULL,
    "end_time" VARCHAR(10) NOT NULL,
    "slot_duration" INTEGER NOT NULL DEFAULT 15,
    "channel" "SlotChannel" NOT NULL DEFAULT 'FLEXIBLE',
    "capacity_per_slot" INTEGER NOT NULL DEFAULT 1,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "effective_from" DATE NOT NULL,
    "effective_until" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recurring_availability_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_overrides" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "hospital_id" UUID,
    "override_type" "OverrideType" NOT NULL,
    "start_date_time" TIMESTAMPTZ(6) NOT NULL,
    "end_date_time" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materialized_appointment_slots" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "hospital_id" UUID,
    "slot_start" TIMESTAMPTZ(6) NOT NULL,
    "slot_end" TIMESTAMPTZ(6) NOT NULL,
    "channel" "SlotChannel" NOT NULL DEFAULT 'FLEXIBLE',
    "state" "SlotState" NOT NULL DEFAULT 'AVAILABLE',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 0,
    "reopened_count" INTEGER NOT NULL DEFAULT 0,
    "last_reopened_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "materialized_appointment_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "uid" VARCHAR(32) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE,
    "gender" "Gender",
    "phone" VARCHAR(32),
    "profile_photo_url" TEXT,
    "street" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "pincode" VARCHAR(20),
    "country" VARCHAR(100) DEFAULT 'India',
    "blood_group" "BloodGroup",
    "aadhaar_hash" VARCHAR(128),
    "organ_donor" BOOLEAN NOT NULL DEFAULT false,
    "emergency_contact_name" VARCHAR(100),
    "emergency_contact_phone" VARCHAR(32),
    "emergency_contact_relation" VARCHAR(50),
    "qr_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_benefits" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "type" VARCHAR(64) NOT NULL DEFAULT 'other_govt',
    "scheme_name" VARCHAR(255),
    "card_number" VARCHAR(128),
    "policy_number" VARCHAR(128),
    "beneficiary_name" VARCHAR(255),
    "employer_name" VARCHAR(255),
    "employee_id" VARCHAR(64),
    "designation" VARCHAR(100),
    "insurer_name" VARCHAR(255),
    "tpa_name" VARCHAR(255),
    "tpa_phone" VARCHAR(32),
    "coverage_amount" DECIMAL(12,2),
    "room_rent_limit" DECIMAL(10,2),
    "family_covered" BOOLEAN NOT NULL DEFAULT false,
    "family_members" TEXT[],
    "valid_from" DATE,
    "valid_until" DATE,
    "hospital_network" TEXT,
    "claim_process" TEXT,
    "helpline_number" VARCHAR(32),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_trusted_doctors" (
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,

    CONSTRAINT "patient_trusted_doctors_pkey" PRIMARY KEY ("patient_id","doctor_id")
);

-- CreateTable
CREATE TABLE "patient_trusted_hospitals" (
    "patient_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,

    CONSTRAINT "patient_trusted_hospitals_pkey" PRIMARY KEY ("patient_id","hospital_id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "appointment_date" DATE NOT NULL,
    "time_slot" VARCHAR(32) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'pending',
    "type" VARCHAR(32) NOT NULL DEFAULT 'consultation',
    "booking_method" VARCHAR(32) NOT NULL DEFAULT 'app',
    "preferred_contact_method" VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
    "contact_phone" VARCHAR(32),
    "symptoms" TEXT,
    "notes" TEXT,
    "confirm_token" VARCHAR(64) NOT NULL,
    "confirm_token_used" BOOLEAN NOT NULL DEFAULT false,
    "patient_confirmed_at" TIMESTAMPTZ(6),
    "handled_by_user_id" UUID,
    "staff_notes" TEXT,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmation_method" VARCHAR(32),
    "bill_amount" DECIMAL(10,2) NOT NULL DEFAULT 500.00,
    "bill_status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_sessions" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "appointment_id" UUID,
    "hospital_appointment_id" UUID,
    "private_clinic_appointment_id" UUID,
    "token" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "consultation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_appointments" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "slot_id" UUID,
    "appointment_channel" "SlotChannel" NOT NULL DEFAULT 'ONLINE',
    "refund_resolution" "CancellationRefundResolution" NOT NULL DEFAULT 'REFUND',
    "transfer_approved_by_user_id" UUID,
    "transfer_approved_at" TIMESTAMPTZ(6),
    "booked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacy_source_id" VARCHAR(24),
    "legacy_imported_at" TIMESTAMPTZ(6),
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "booking_channel" "BookingChannel" NOT NULL DEFAULT 'ONLINE_APP',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'pending',
    "confirmation_mode" "HospitalConfirmationMode" NOT NULL DEFAULT 'TIME_BASED',
    "appointment_date" DATE NOT NULL,
    "time_slot" VARCHAR(32) NOT NULL,
    "slot_start_time" TIMESTAMPTZ(6) NOT NULL,
    "slot_end_time" TIMESTAMPTZ(6) NOT NULL,
    "hold_expires_at" TIMESTAMPTZ(6),
    "payment_hold_status" "PaymentHoldStatus" NOT NULL DEFAULT 'NONE',
    "deposit_required" BOOLEAN NOT NULL DEFAULT false,
    "deposit_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "total_fee" DECIMAL(10,2) NOT NULL DEFAULT 500.00,
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "payment_idempotency_key" VARCHAR(128),
    "policy_snapshot" JSONB,
    "reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "cancellation_initiator" "CancellationInitiator",
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "refund_status" "RefundStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "refund_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "refund_transaction_ref" VARCHAR(128),
    "no_show_recorded" BOOLEAN NOT NULL DEFAULT false,
    "booked_by_user_id" UUID,
    "handled_by_user_id" UUID,
    "support_notes" TEXT,
    "staff_notes" TEXT,
    "confirm_token" VARCHAR(64) NOT NULL,
    "confirm_token_used" BOOLEAN NOT NULL DEFAULT false,
    "patient_confirmed_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmation_method" VARCHAR(32),
    "symptoms" TEXT,
    "notes" TEXT,
    "contact_phone" VARCHAR(32),
    "preferred_contact_method" VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hospital_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_clinic_appointments" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "clinic_hospital_id" UUID,
    "slot_id" UUID,
    "appointment_channel" "SlotChannel" NOT NULL DEFAULT 'ONLINE',
    "refund_resolution" "CancellationRefundResolution" NOT NULL DEFAULT 'REFUND',
    "transfer_approved_by_user_id" UUID,
    "transfer_approved_at" TIMESTAMPTZ(6),
    "booked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacy_source_id" VARCHAR(24),
    "legacy_imported_at" TIMESTAMPTZ(6),
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "booking_channel" "BookingChannel" NOT NULL DEFAULT 'ONLINE_APP',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'pending',
    "appointment_date" DATE NOT NULL,
    "time_slot" VARCHAR(32) NOT NULL,
    "slot_start_time" TIMESTAMPTZ(6) NOT NULL,
    "slot_end_time" TIMESTAMPTZ(6) NOT NULL,
    "hold_expires_at" TIMESTAMPTZ(6),
    "payment_hold_status" "PaymentHoldStatus" NOT NULL DEFAULT 'NONE',
    "deposit_percentage" DECIMAL(5,2) NOT NULL DEFAULT 50.00,
    "deposit_amount" DECIMAL(10,2) NOT NULL,
    "total_fee" DECIMAL(10,2) NOT NULL DEFAULT 500.00,
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "payment_idempotency_key" VARCHAR(128),
    "policy_snapshot" JSONB,
    "reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "cancellation_initiator" "CancellationInitiator",
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "refund_status" "RefundStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "refund_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "refund_transaction_ref" VARCHAR(128),
    "no_show_recorded" BOOLEAN NOT NULL DEFAULT false,
    "booked_by_user_id" UUID,
    "handled_by_user_id" UUID,
    "support_notes" TEXT,
    "doctor_notes" TEXT,
    "confirm_token" VARCHAR(64) NOT NULL,
    "confirm_token_used" BOOLEAN NOT NULL DEFAULT false,
    "patient_confirmed_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmation_method" VARCHAR(32),
    "symptoms" TEXT,
    "notes" TEXT,
    "contact_phone" VARCHAR(32),
    "preferred_contact_method" VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "private_clinic_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounters" (
    "id" UUID NOT NULL,
    "appointment_id" UUID,
    "hospital_appointment_id" UUID,
    "private_clinic_appointment_id" UUID,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "hospital_id" UUID,
    "encounter_type" "EncounterType" NOT NULL DEFAULT 'ambulatory',
    "status" "EncounterStatus" NOT NULL DEFAULT 'in_progress',
    "start_time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_time" TIMESTAMPTZ(6),
    "chief_complaint" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vitals" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "systolic_bp" INTEGER,
    "diastolic_bp" INTEGER,
    "heart_rate" INTEGER,
    "respiratory_rate" INTEGER,
    "temperature_celsius" DECIMAL(4,2),
    "spo2_percentage" INTEGER,
    "weight_kg" DECIMAL(5,2),
    "height_cm" DECIMAL(5,2),
    "bmi" DECIMAL(4,2),

    CONSTRAINT "vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_notes" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "note_type" VARCHAR(32) NOT NULL DEFAULT 'progress',
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conditions" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "encounter_id" UUID,
    "icd10_code" VARCHAR(16),
    "display_name" VARCHAR(255) NOT NULL,
    "clinical_status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "verification_status" VARCHAR(32) NOT NULL DEFAULT 'confirmed',
    "diagnosed_date" DATE,
    "resolved_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergies" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "substance" VARCHAR(255) NOT NULL,
    "reaction" TEXT,
    "severity" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL,
    "encounter_id" UUID,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "hospital_id" UUID,
    "notes" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" UUID NOT NULL,
    "prescription_id" UUID NOT NULL,
    "medication_name" VARCHAR(255) NOT NULL,
    "dosage" VARCHAR(100) NOT NULL,
    "form" VARCHAR(50),
    "frequency" VARCHAR(100),
    "duration" VARCHAR(50),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "instructions" TEXT,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy_dispenses" (
    "id" UUID NOT NULL,
    "pharmacy_id" UUID NOT NULL,
    "prescription_item_id" UUID NOT NULL,
    "quantity_dispensed" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "dispensed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_dispenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_orders" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "test_name" VARCHAR(255) NOT NULL,
    "reason" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "ordered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_results" (
    "id" UUID NOT NULL,
    "lab_order_id" UUID NOT NULL,
    "metric_name" VARCHAR(255) NOT NULL,
    "value" VARCHAR(100) NOT NULL,
    "unit" VARCHAR(50),
    "normal_range" VARCHAR(100),
    "flag" VARCHAR(32),
    "result_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imaging_orders" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "modality" VARCHAR(64) NOT NULL,
    "body_part" VARCHAR(100) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "ordered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imaging_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imaging_studies" (
    "id" UUID NOT NULL,
    "imaging_order_id" UUID NOT NULL,
    "findings" TEXT,
    "impression" TEXT,
    "report_url" TEXT,
    "dicom_series_uid" VARCHAR(128),
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imaging_studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_documents" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "encounter_id" UUID,
    "uploaded_by_user_id" UUID NOT NULL,
    "hospital_name" VARCHAR(255),
    "doctor_name" VARCHAR(255),
    "type" "DocumentType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" VARCHAR(255),
    "file_size_bytes" INTEGER,
    "mime_type" VARCHAR(100),
    "notes" TEXT,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_records" (
    "id" UUID NOT NULL,
    "bill_code" VARCHAR(64) NOT NULL,
    "patient_id" UUID NOT NULL,
    "appointment_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "hospital_name" VARCHAR(255),
    "doctor_name" VARCHAR(255),
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'pending',
    "due_date" DATE,
    "paid_at" TIMESTAMPTZ(6),
    "payment_method" VARCHAR(100),
    "hospital_appointment_id" UUID,
    "private_clinic_appointment_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blood_requests" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "patient_name" VARCHAR(100) NOT NULL,
    "blood_group" VARCHAR(8) NOT NULL,
    "units" INTEGER NOT NULL,
    "hospital" VARCHAR(255) NOT NULL,
    "urgency" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "reason" TEXT,
    "requester_name" VARCHAR(100),
    "requester_phone" VARCHAR(32),
    "requester_relation" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blood_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_orders" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "street" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "pincode" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "payment_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "payment_method" VARCHAR(50) NOT NULL DEFAULT 'Cash on Delivery',
    "prescription_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medicine_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_order_items" (
    "id" UUID NOT NULL,
    "medicine_order_id" UUID NOT NULL,
    "medicine_id" VARCHAR(64),
    "name" VARCHAR(255) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "medicine_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "appointment_id" UUID,
    "hospital_appointment_id" UUID,
    "private_clinic_appointment_id" UUID,
    "type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "message" TEXT NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "grantee_type" VARCHAR(32) NOT NULL,
    "grantee_id" VARCHAR(64) NOT NULL,
    "scopes" TEXT[],
    "purpose" VARCHAR(100),
    "status" "ConsentStatus" NOT NULL DEFAULT 'active',
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grants" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID,
    "hospital_id" UUID,
    "purpose" VARCHAR(100) NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_glass_events" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "triggered_by_id" UUID NOT NULL,
    "doctor_id" UUID,
    "hospital_id" UUID,
    "emergency_reason" TEXT NOT NULL,
    "accessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "break_glass_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID,
    "appointment_id" UUID,
    "hospital_appointment_id" UUID,
    "private_clinic_appointment_id" UUID,
    "accessed_by_id" UUID NOT NULL,
    "session_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "reason" TEXT,
    "accessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "website" VARCHAR(255),
    "phone" VARCHAR(32),
    "address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_requirements" (
    "id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "target_sample_size" VARCHAR(100) NOT NULL,
    "data_needed" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pricing" JSONB NOT NULL DEFAULT '{"prescriptions":0,"scans":0,"xrays":0,"labReports":0}',
    "required_docs" TEXT[],
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_submissions" (
    "id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "patient_name" VARCHAR(100),
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "payout_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_documents" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" VARCHAR(255),
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_messages" (
    "id" UUID NOT NULL,
    "requirement_id" UUID,
    "sender_id" UUID NOT NULL,
    "receiver_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_consents" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "consent_scopes" TEXT[],
    "status" "DatasetConsentStatus" NOT NULL DEFAULT 'pending',
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approved_datasets" (
    "id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "dataset_consent_id" UUID NOT NULL,
    "status" "ApprovedDatasetStatus" NOT NULL DEFAULT 'pending_review',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deidentification_status" "DeidentificationStatus" NOT NULL DEFAULT 'not_started',
    "storage_ref" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "approved_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_access_grants" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "purpose" VARCHAR(255) NOT NULL,
    "status" "DatasetAccessGrantStatus" NOT NULL DEFAULT 'active',
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_access_logs" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "access_grant_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "request_metadata" JSONB,
    "accessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_slot_reservations" (
    "id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "hospital_appointment_id" UUID,
    "private_clinic_appointment_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "seat_number" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "expires_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_slot_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_payments" (
    "id" UUID NOT NULL,
    "hospital_appointment_id" UUID,
    "private_clinic_appointment_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "refund_allocated" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "provider_transaction_ref" VARCHAR(128),
    "idempotency_key" VARCHAR(128) NOT NULL,
    "status" "AppointmentPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "captured_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "hospital_appointment_id" UUID,
    "private_clinic_appointment_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "provider_transaction_ref" VARCHAR(128),
    "idempotency_key" VARCHAR(128) NOT NULL,
    "status" "AppointmentRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_financial_events" (
    "id" BIGSERIAL NOT NULL,
    "payment_id" UUID,
    "refund_id" UUID,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_financial_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_uid_key" ON "users"("uid");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_uid_idx" ON "users"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_user_id_key" ON "hospitals"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_uid_key" ON "hospitals"("uid");

-- CreateIndex
CREATE INDEX "hospitals_city_idx" ON "hospitals"("city");

-- CreateIndex
CREATE INDEX "hospitals_is_active_idx" ON "hospitals"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "pharmacies_user_id_key" ON "pharmacies"("user_id");

-- CreateIndex
CREATE INDEX "pharmacies_hospital_id_idx" ON "pharmacies"("hospital_id");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_memberships_uid_key" ON "hospital_memberships"("uid");

-- CreateIndex
CREATE INDEX "hospital_memberships_hospital_id_idx" ON "hospital_memberships"("hospital_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_user_id_key" ON "doctors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_uid_key" ON "doctors"("uid");

-- CreateIndex
CREATE INDEX "doctors_specialization_idx" ON "doctors"("specialization");

-- CreateIndex
CREATE INDEX "doctors_primary_hospital_id_idx" ON "doctors"("primary_hospital_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_hospital_memberships_doctor_id_hospital_id_key" ON "doctor_hospital_memberships"("doctor_id", "hospital_id");

-- CreateIndex
CREATE INDEX "doctor_slots_doctor_id_schedule_type_specific_date_day_of_w_idx" ON "doctor_slots"("doctor_id", "schedule_type", "specific_date", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_scheduling_rules_hospital_id_key" ON "hospital_scheduling_rules"("hospital_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_clinic_policies_doctor_id_key" ON "doctor_clinic_policies"("doctor_id");

-- CreateIndex
CREATE INDEX "recurring_availability_templates_doctor_id_day_of_week_is_a_idx" ON "recurring_availability_templates"("doctor_id", "day_of_week", "is_active");

-- CreateIndex
CREATE INDEX "recurring_availability_templates_hospital_id_idx" ON "recurring_availability_templates"("hospital_id");

-- CreateIndex
CREATE INDEX "schedule_overrides_doctor_id_start_date_time_end_date_time_idx" ON "schedule_overrides"("doctor_id", "start_date_time", "end_date_time");

-- CreateIndex
CREATE INDEX "materialized_appointment_slots_doctor_id_slot_start_slot_en_idx" ON "materialized_appointment_slots"("doctor_id", "slot_start", "slot_end");

-- CreateIndex
CREATE INDEX "materialized_appointment_slots_hospital_id_slot_start_idx" ON "materialized_appointment_slots"("hospital_id", "slot_start");

-- CreateIndex
CREATE INDEX "materialized_appointment_slots_state_slot_start_idx" ON "materialized_appointment_slots"("state", "slot_start");

-- CreateIndex
CREATE UNIQUE INDEX "patients_user_id_key" ON "patients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_uid_key" ON "patients"("uid");

-- CreateIndex
CREATE INDEX "patients_uid_idx" ON "patients"("uid");

-- CreateIndex
CREATE INDEX "patients_phone_idx" ON "patients"("phone");

-- CreateIndex
CREATE INDEX "patient_benefits_patient_id_idx" ON "patient_benefits"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_confirm_token_key" ON "appointments"("confirm_token");

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");

-- CreateIndex
CREATE INDEX "appointments_doctor_id_appointment_date_idx" ON "appointments"("doctor_id", "appointment_date");

-- CreateIndex
CREATE INDEX "appointments_hospital_id_idx" ON "appointments"("hospital_id");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_sessions_token_key" ON "consultation_sessions"("token");

-- CreateIndex
CREATE INDEX "consultation_sessions_patient_id_doctor_id_status_idx" ON "consultation_sessions"("patient_id", "doctor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_appointments_legacy_source_id_key" ON "hospital_appointments"("legacy_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_appointments_payment_idempotency_key_key" ON "hospital_appointments"("payment_idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_appointments_confirm_token_key" ON "hospital_appointments"("confirm_token");

-- CreateIndex
CREATE INDEX "hospital_appointments_patient_id_idx" ON "hospital_appointments"("patient_id");

-- CreateIndex
CREATE INDEX "hospital_appointments_doctor_id_appointment_date_idx" ON "hospital_appointments"("doctor_id", "appointment_date");

-- CreateIndex
CREATE INDEX "hospital_appointments_hospital_id_appointment_date_idx" ON "hospital_appointments"("hospital_id", "appointment_date");

-- CreateIndex
CREATE INDEX "hospital_appointments_status_hold_expires_at_idx" ON "hospital_appointments"("status", "hold_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "private_clinic_appointments_legacy_source_id_key" ON "private_clinic_appointments"("legacy_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "private_clinic_appointments_payment_idempotency_key_key" ON "private_clinic_appointments"("payment_idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "private_clinic_appointments_confirm_token_key" ON "private_clinic_appointments"("confirm_token");

-- CreateIndex
CREATE INDEX "private_clinic_appointments_patient_id_idx" ON "private_clinic_appointments"("patient_id");

-- CreateIndex
CREATE INDEX "private_clinic_appointments_doctor_id_appointment_date_idx" ON "private_clinic_appointments"("doctor_id", "appointment_date");

-- CreateIndex
CREATE INDEX "private_clinic_appointments_status_hold_expires_at_idx" ON "private_clinic_appointments"("status", "hold_expires_at");

-- CreateIndex
CREATE INDEX "encounters_patient_id_idx" ON "encounters"("patient_id");

-- CreateIndex
CREATE INDEX "encounters_doctor_id_idx" ON "encounters"("doctor_id");

-- CreateIndex
CREATE INDEX "vitals_encounter_id_idx" ON "vitals"("encounter_id");

-- CreateIndex
CREATE INDEX "clinical_notes_encounter_id_idx" ON "clinical_notes"("encounter_id");

-- CreateIndex
CREATE INDEX "conditions_patient_id_idx" ON "conditions"("patient_id");

-- CreateIndex
CREATE INDEX "allergies_patient_id_idx" ON "allergies"("patient_id");

-- CreateIndex
CREATE INDEX "prescriptions_patient_id_idx" ON "prescriptions"("patient_id");

-- CreateIndex
CREATE INDEX "prescriptions_doctor_id_idx" ON "prescriptions"("doctor_id");

-- CreateIndex
CREATE INDEX "prescription_items_prescription_id_idx" ON "prescription_items"("prescription_id");

-- CreateIndex
CREATE INDEX "pharmacy_dispenses_pharmacy_id_idx" ON "pharmacy_dispenses"("pharmacy_id");

-- CreateIndex
CREATE INDEX "lab_orders_encounter_id_idx" ON "lab_orders"("encounter_id");

-- CreateIndex
CREATE INDEX "lab_results_lab_order_id_idx" ON "lab_results"("lab_order_id");

-- CreateIndex
CREATE INDEX "imaging_orders_encounter_id_idx" ON "imaging_orders"("encounter_id");

-- CreateIndex
CREATE INDEX "imaging_studies_imaging_order_id_idx" ON "imaging_studies"("imaging_order_id");

-- CreateIndex
CREATE INDEX "medical_documents_patient_id_idx" ON "medical_documents"("patient_id");

-- CreateIndex
CREATE INDEX "medical_documents_type_idx" ON "medical_documents"("type");

-- CreateIndex
CREATE UNIQUE INDEX "billing_records_bill_code_key" ON "billing_records"("bill_code");

-- CreateIndex
CREATE INDEX "billing_records_patient_id_idx" ON "billing_records"("patient_id");

-- CreateIndex
CREATE INDEX "billing_records_status_idx" ON "billing_records"("status");

-- CreateIndex
CREATE INDEX "blood_requests_patient_id_idx" ON "blood_requests"("patient_id");

-- CreateIndex
CREATE INDEX "medicine_orders_patient_id_idx" ON "medicine_orders"("patient_id");

-- CreateIndex
CREATE INDEX "medicine_order_items_medicine_order_id_idx" ON "medicine_order_items"("medicine_order_id");

-- CreateIndex
CREATE INDEX "notifications_patient_id_idx" ON "notifications"("patient_id");

-- CreateIndex
CREATE INDEX "consents_patient_id_status_idx" ON "consents"("patient_id", "status");

-- CreateIndex
CREATE INDEX "access_grants_patient_id_idx" ON "access_grants"("patient_id");

-- CreateIndex
CREATE INDEX "break_glass_events_patient_id_idx" ON "break_glass_events"("patient_id");

-- CreateIndex
CREATE INDEX "access_logs_patient_id_accessed_at_idx" ON "access_logs"("patient_id", "accessed_at");

-- CreateIndex
CREATE UNIQUE INDEX "buyers_user_id_key" ON "buyers"("user_id");

-- CreateIndex
CREATE INDEX "research_requirements_buyer_id_idx" ON "research_requirements"("buyer_id");

-- CreateIndex
CREATE INDEX "research_requirements_status_idx" ON "research_requirements"("status");

-- CreateIndex
CREATE INDEX "dataset_submissions_requirement_id_idx" ON "dataset_submissions"("requirement_id");

-- CreateIndex
CREATE INDEX "dataset_submissions_patient_id_idx" ON "dataset_submissions"("patient_id");

-- CreateIndex
CREATE INDEX "submission_documents_submission_id_idx" ON "submission_documents"("submission_id");

-- CreateIndex
CREATE INDEX "marketplace_messages_sender_id_receiver_id_idx" ON "marketplace_messages"("sender_id", "receiver_id");

-- CreateIndex
CREATE INDEX "marketplace_messages_receiver_id_is_read_idx" ON "marketplace_messages"("receiver_id", "is_read");

-- CreateIndex
CREATE INDEX "dataset_consents_patient_id_idx" ON "dataset_consents"("patient_id");

-- CreateIndex
CREATE INDEX "dataset_consents_requirement_id_idx" ON "dataset_consents"("requirement_id");

-- CreateIndex
CREATE INDEX "approved_datasets_requirement_id_idx" ON "approved_datasets"("requirement_id");

-- CreateIndex
CREATE INDEX "dataset_access_grants_dataset_id_idx" ON "dataset_access_grants"("dataset_id");

-- CreateIndex
CREATE INDEX "dataset_access_grants_buyer_id_idx" ON "dataset_access_grants"("buyer_id");

-- CreateIndex
CREATE INDEX "dataset_access_logs_dataset_id_accessed_at_idx" ON "dataset_access_logs"("dataset_id", "accessed_at");

-- CreateIndex
CREATE INDEX "dataset_access_logs_buyer_id_idx" ON "dataset_access_logs"("buyer_id");

-- CreateIndex
CREATE INDEX "appointment_slot_reservations_slot_id_status_idx" ON "appointment_slot_reservations"("slot_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_payments_idempotency_key_key" ON "appointment_payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_payments_provider_provider_transaction_ref_key" ON "appointment_payments"("provider", "provider_transaction_ref");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_refunds_idempotency_key_key" ON "appointment_refunds"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_refunds_provider_provider_transaction_ref_key" ON "appointment_refunds"("provider", "provider_transaction_ref");

-- AddForeignKey
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacies" ADD CONSTRAINT "pharmacies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacies" ADD CONSTRAINT "pharmacies_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_memberships" ADD CONSTRAINT "hospital_memberships_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_primary_hospital_id_fkey" FOREIGN KEY ("primary_hospital_id") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_hospital_memberships" ADD CONSTRAINT "doctor_hospital_memberships_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_hospital_memberships" ADD CONSTRAINT "doctor_hospital_memberships_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_slots" ADD CONSTRAINT "doctor_slots_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_slots" ADD CONSTRAINT "doctor_slots_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_scheduling_rules" ADD CONSTRAINT "hospital_scheduling_rules_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_clinic_policies" ADD CONSTRAINT "doctor_clinic_policies_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_availability_templates" ADD CONSTRAINT "recurring_availability_templates_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_availability_templates" ADD CONSTRAINT "recurring_availability_templates_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materialized_appointment_slots" ADD CONSTRAINT "materialized_appointment_slots_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materialized_appointment_slots" ADD CONSTRAINT "materialized_appointment_slots_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_benefits" ADD CONSTRAINT "patient_benefits_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_trusted_doctors" ADD CONSTRAINT "patient_trusted_doctors_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_trusted_doctors" ADD CONSTRAINT "patient_trusted_doctors_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_trusted_hospitals" ADD CONSTRAINT "patient_trusted_hospitals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_trusted_hospitals" ADD CONSTRAINT "patient_trusted_hospitals_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_handled_by_user_id_fkey" FOREIGN KEY ("handled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_sessions" ADD CONSTRAINT "consultation_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_sessions" ADD CONSTRAINT "consultation_sessions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_sessions" ADD CONSTRAINT "consultation_sessions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_sessions" ADD CONSTRAINT "consultation_sessions_hospital_appointment_id_fkey" FOREIGN KEY ("hospital_appointment_id") REFERENCES "hospital_appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_sessions" ADD CONSTRAINT "consultation_sessions_private_clinic_appointment_id_fkey" FOREIGN KEY ("private_clinic_appointment_id") REFERENCES "private_clinic_appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_appointments" ADD CONSTRAINT "hospital_appointments_transfer_approved_by_user_id_fkey" FOREIGN KEY ("transfer_approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_appointments" ADD CONSTRAINT "hospital_appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_appointments" ADD CONSTRAINT "hospital_appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_appointments" ADD CONSTRAINT "hospital_appointments_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_appointments" ADD CONSTRAINT "hospital_appointments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "materialized_appointment_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_appointments" ADD CONSTRAINT "hospital_appointments_booked_by_user_id_fkey" FOREIGN KEY ("booked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_appointments" ADD CONSTRAINT "hospital_appointments_handled_by_user_id_fkey" FOREIGN KEY ("handled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_clinic_appointments" ADD CONSTRAINT "private_clinic_appointments_transfer_approved_by_user_id_fkey" FOREIGN KEY ("transfer_approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_clinic_appointments" ADD CONSTRAINT "private_clinic_appointments_clinic_hospital_id_fkey" FOREIGN KEY ("clinic_hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_clinic_appointments" ADD CONSTRAINT "private_clinic_appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_clinic_appointments" ADD CONSTRAINT "private_clinic_appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_clinic_appointments" ADD CONSTRAINT "private_clinic_appointments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "materialized_appointment_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_clinic_appointments" ADD CONSTRAINT "private_clinic_appointments_booked_by_user_id_fkey" FOREIGN KEY ("booked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_clinic_appointments" ADD CONSTRAINT "private_clinic_appointments_handled_by_user_id_fkey" FOREIGN KEY ("handled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_hospital_appointment_id_fkey" FOREIGN KEY ("hospital_appointment_id") REFERENCES "hospital_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_private_clinic_appointment_id_fkey" FOREIGN KEY ("private_clinic_appointment_id") REFERENCES "private_clinic_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_dispenses" ADD CONSTRAINT "pharmacy_dispenses_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_dispenses" ADD CONSTRAINT "pharmacy_dispenses_prescription_item_id_fkey" FOREIGN KEY ("prescription_item_id") REFERENCES "prescription_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_orders" ADD CONSTRAINT "imaging_orders_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_studies" ADD CONSTRAINT "imaging_studies_imaging_order_id_fkey" FOREIGN KEY ("imaging_order_id") REFERENCES "imaging_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_hospital_appointment_id_fkey" FOREIGN KEY ("hospital_appointment_id") REFERENCES "hospital_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_private_clinic_appointment_id_fkey" FOREIGN KEY ("private_clinic_appointment_id") REFERENCES "private_clinic_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_orders" ADD CONSTRAINT "medicine_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_order_items" ADD CONSTRAINT "medicine_order_items_medicine_order_id_fkey" FOREIGN KEY ("medicine_order_id") REFERENCES "medicine_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_hospital_appointment_id_fkey" FOREIGN KEY ("hospital_appointment_id") REFERENCES "hospital_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_private_clinic_appointment_id_fkey" FOREIGN KEY ("private_clinic_appointment_id") REFERENCES "private_clinic_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_glass_events" ADD CONSTRAINT "break_glass_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_glass_events" ADD CONSTRAINT "break_glass_events_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_glass_events" ADD CONSTRAINT "break_glass_events_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_glass_events" ADD CONSTRAINT "break_glass_events_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_hospital_appointment_id_fkey" FOREIGN KEY ("hospital_appointment_id") REFERENCES "hospital_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_private_clinic_appointment_id_fkey" FOREIGN KEY ("private_clinic_appointment_id") REFERENCES "private_clinic_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_accessed_by_id_fkey" FOREIGN KEY ("accessed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "consultation_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_requirements" ADD CONSTRAINT "research_requirements_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_submissions" ADD CONSTRAINT "dataset_submissions_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "research_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_submissions" ADD CONSTRAINT "dataset_submissions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_documents" ADD CONSTRAINT "submission_documents_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "dataset_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "research_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_messages" ADD CONSTRAINT "marketplace_messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_consents" ADD CONSTRAINT "dataset_consents_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "dataset_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_consents" ADD CONSTRAINT "dataset_consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_consents" ADD CONSTRAINT "dataset_consents_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "research_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approved_datasets" ADD CONSTRAINT "approved_datasets_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "research_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approved_datasets" ADD CONSTRAINT "approved_datasets_dataset_consent_id_fkey" FOREIGN KEY ("dataset_consent_id") REFERENCES "dataset_consents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_access_grants" ADD CONSTRAINT "dataset_access_grants_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "approved_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_access_grants" ADD CONSTRAINT "dataset_access_grants_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_access_logs" ADD CONSTRAINT "dataset_access_logs_access_grant_id_fkey" FOREIGN KEY ("access_grant_id") REFERENCES "dataset_access_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_access_logs" ADD CONSTRAINT "dataset_access_logs_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "approved_datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_access_logs" ADD CONSTRAINT "dataset_access_logs_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_slot_reservations" ADD CONSTRAINT "appointment_slot_reservations_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "materialized_appointment_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_slot_reservations" ADD CONSTRAINT "appointment_slot_reservations_hospital_appointment_id_fkey" FOREIGN KEY ("hospital_appointment_id") REFERENCES "hospital_appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_slot_reservations" ADD CONSTRAINT "appointment_slot_reservations_private_clinic_appointment_i_fkey" FOREIGN KEY ("private_clinic_appointment_id") REFERENCES "private_clinic_appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_slot_reservations" ADD CONSTRAINT "appointment_slot_reservations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_payments" ADD CONSTRAINT "appointment_payments_hospital_appointment_id_fkey" FOREIGN KEY ("hospital_appointment_id") REFERENCES "hospital_appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_payments" ADD CONSTRAINT "appointment_payments_private_clinic_appointment_id_fkey" FOREIGN KEY ("private_clinic_appointment_id") REFERENCES "private_clinic_appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_payments" ADD CONSTRAINT "appointment_payments_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_refunds" ADD CONSTRAINT "appointment_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "appointment_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_refunds" ADD CONSTRAINT "appointment_refunds_hospital_appointment_id_fkey" FOREIGN KEY ("hospital_appointment_id") REFERENCES "hospital_appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_refunds" ADD CONSTRAINT "appointment_refunds_private_clinic_appointment_id_fkey" FOREIGN KEY ("private_clinic_appointment_id") REFERENCES "private_clinic_appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_refunds" ADD CONSTRAINT "appointment_refunds_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_financial_events" ADD CONSTRAINT "appointment_financial_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "appointment_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_financial_events" ADD CONSTRAINT "appointment_financial_events_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "appointment_refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
