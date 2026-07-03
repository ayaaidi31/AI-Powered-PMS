-- ============================================================================
-- schema.sql — PostgreSQL schema for the practice-management-app
-- ----------------------------------------------------------------------------
-- Mirrors lib/seed-data.ts (normalized relational, NOT FHIR).
--
-- SAFETY: This script only CREATEs the application tables below. It NEVER
-- touches the LangChain RAG tables `langchain_pg_embedding` and
-- `langchain_pg_collection`. All statements use IF NOT EXISTS and there are
-- no DROP/ALTER/TRUNCATE here, so running it is non-destructive.
--
-- German-law design choices baked in:
--  * No ON DELETE CASCADE on patient clinical rows (§630f BGB ~10y retention) —
--    RESTRICT is used, relying on a `deleted_at` soft delete instead.
--  * invoice_number is UNIQUE and sequential/gapless (§14 UStG / GoBD); a
--    cancellation references the original via `storno_of` (never deleted).
--  * Money in integer CENTS (no float rounding).
--  * uuid PKs via gen_random_uuid(); dates as date / timestamptz.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- provides gen_random_uuid()

-- ───────────────────────────── LOOKUP TABLES ──────────────────────────────
-- Static German rulebooks. Load full official catalogs into these.

CREATE TABLE IF NOT EXISTS icd_10_gm (
  code        text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS ebm_catalog (        -- public / GKV
  code        text PRIMARY KEY,
  description text NOT NULL,
  fee_in_cents integer NOT NULL CHECK (fee_in_cents >= 0)
);

CREATE TABLE IF NOT EXISTS goae_catalog (       -- private / PKV
  code               text PRIMARY KEY,
  description        text NOT NULL,
  base_cents         integer NOT NULL CHECK (base_cents >= 0),  -- 1.0x Punktwert
  default_multiplier numeric(3,1) NOT NULL                      -- Steigerungssatz
);

CREATE TABLE IF NOT EXISTS medication_pzn (
  pzn_code          text PRIMARY KEY,
  name              text NOT NULL,
  active_ingredient text NOT NULL
);

-- ──────────────────────────────── PEOPLE ──────────────────────────────────

CREATE TABLE IF NOT EXISTS doctors (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name         text NOT NULL,
  last_name          text NOT NULL,
  email              text UNIQUE NOT NULL,
  phone              text,
  specialization     text,
  lanr               text,             -- Lebenslange Arztnummer
  department         text,
  max_daily_capacity integer NOT NULL DEFAULT 20 CHECK (max_daily_capacity > 0),
  is_available       boolean NOT NULL DEFAULT true,
  unavailable_from   date,             -- absence window start (sick leave); NULL when on duty
  unavailable_until  date              -- absence window end; NULL = open-ended
);

CREATE TABLE IF NOT EXISTS receptionists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name  text NOT NULL,
  email      text UNIQUE NOT NULL,
  phone      text,
  department text
);

-- patients: SHORT (identity + insurance only). Clinical data in child tables.
CREATE TABLE IF NOT EXISTS patients (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name        text NOT NULL,
  last_name         text NOT NULL,
  birth_date        date NOT NULL,
  email             text,                        -- nullable: "analog" patients
  phone             text,
  insurance_type    text NOT NULL CHECK (insurance_type IN ('gkv','pkv','selbstzahler')),
  versicherten_id   text UNIQUE,                 -- 10-char KVNR; NULL for self-pay
  is_digital_active boolean NOT NULL DEFAULT false,
  guardian_contact  text,                        -- required if under 18
  street            text,
  city              text,
  postal_code       text,
  country           text,
  last_updated_by   text,                        -- 'User: Braun' | 'AI-Module-15'
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz                  -- soft delete (legal retention)
);

-- ─────────────────────── PATIENT CLINICAL CHILD TABLES ─────────────────────
-- FKs RESTRICT on delete (no cascade) to honour clinical-record retention.

CREATE TABLE IF NOT EXISTS patient_allergies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  substance   text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patient_conditions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  icd10_code  text REFERENCES icd_10_gm(code) ON DELETE RESTRICT,
  label       text,                              -- convenience copy
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  pzn_code   text REFERENCES medication_pzn(pzn_code) ON DELETE RESTRICT, -- nullable
  name       text NOT NULL,
  dosage     text,
  frequency  text,
  start_date date,
  end_date   date                                -- NULL = ongoing
);

CREATE TABLE IF NOT EXISTS surgeries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  name         text NOT NULL,
  surgery_date date,
  notes        text
);

-- ──────────────────────── SCHEDULING / CLINICAL EVENTS ─────────────────────

CREATE TABLE IF NOT EXISTS appointments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id         uuid NOT NULL REFERENCES doctors(id)  ON DELETE RESTRICT,
  starts_at         timestamptz NOT NULL,
  duration_min      integer NOT NULL DEFAULT 30 CHECK (duration_min > 0),
  status            text NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','waiting','in_progress','completed','cancelled','no_show')),
  reason            text,
  reason_for_change text,                         -- required on reschedule/cancel
  check_in_at       timestamptz,
  doctor_notes      text,                         -- raw notes (AI reads this)
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Booking provenance (Feature 11): how the appointment was created, and — for
-- AI voice-agent bookings — whether reception has reviewed it.
--   source: 'manual' (receptionist) | 'online' (patient self-service) | 'ai_voice'
--   ai_review_status: NULL normally; 'pending' | 'confirmed' | 'flagged' for ai_voice
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ai_review_status text;

-- vitals: per-visit time series. "Current vitals" = latest recorded_at.
CREATE TABLE IF NOT EXISTS vitals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL, -- nullable
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  height_cm      integer,
  weight_kg      numeric(5,1),
  systolic       integer,
  diastolic      integer,
  heart_rate     integer,
  temperature_c  numeric(3,1)
);

-- medical_reports: Feature 2 output; immutable after approval (BR-02-06).
CREATE TABLE IF NOT EXISTS medical_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  patient_id       uuid NOT NULL REFERENCES patients(id)     ON DELETE RESTRICT,
  doctor_id        uuid NOT NULL REFERENCES doctors(id)      ON DELETE RESTRICT,
  diagnosis        text,
  raw_notes        text,                          -- always retained (BR-02-02)
  formatted_report text,                          -- AI-structured version
  internal_notes   text,                          -- staff-only (stripped pre-AI)
  prescriptions    jsonb,                          -- [{medication,dosage,frequency}]
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','pending_approval','approved')),
  approved_at      timestamptz,
  version          integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- Additive column for databases created before `prescriptions` existed.
ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS prescriptions jsonb;

-- report_billing_codes: junction from a report to EBM/GOÄ catalogs.
CREATE TABLE IF NOT EXISTS report_billing_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid NOT NULL REFERENCES medical_reports(id) ON DELETE RESTRICT,
  catalog    text NOT NULL CHECK (catalog IN ('EBM','GOAE')),
  code       text NOT NULL,                       -- FK-by-convention to ebm/goae catalog
  multiplier numeric(3,1)                         -- GOÄ only; NULL for EBM
);

-- invoices: Feature 3; sequential number is a legal requirement (§14 UStG/GoBD).
CREATE TABLE IF NOT EXISTS invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,            -- sequential, no gaps
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  patient_id     uuid NOT NULL REFERENCES patients(id)     ON DELETE RESTRICT,
  insurance_type text NOT NULL CHECK (insurance_type IN ('gkv','pkv','selbstzahler')),
  total_cents    integer CHECK (total_cents IS NULL OR total_cents >= 0), -- NULL for gkv
  status         text NOT NULL DEFAULT 'pending_payment'
                 CHECK (status IN ('ready_for_kv','pending_payment','sent','paid','storno')),
  storno_of      uuid REFERENCES invoices(id) ON DELETE RESTRICT,  -- cancellation link
  due_date       date,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- AI-proposed patient-profile updates (Feature 15 / AI-Module-15). After a
-- consultation is confirmed, the AI scans the report for profile data that
-- changed (a new allergy, a new address …). The doctor confirms a proposal,
-- stored here as 'pending_patient'; the patient then accepts (the field is
-- applied to their profile) or rejects it.
CREATE TABLE IF NOT EXISTS profile_change_proposals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  field          text NOT NULL,   -- phone|email|street|city|postal_code|country|allergy|condition
  label          text NOT NULL,   -- human-readable summary of the change
  current_value  text,
  proposed_value text NOT NULL,
  reason         text,
  status         text NOT NULL DEFAULT 'pending_patient'
                 CHECK (status IN ('pending_patient','accepted','rejected')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz
);

-- patient_documents: files attached to a patient record (imaging such as X-ray
-- or MRI, lab results, referrals, prescriptions …). A document may be uploaded
-- by the treating doctor during, before, or after a consultation, or by the
-- patient from the portal. Title and description are free text. The file bytes
-- live in `content` (bytea) so the prototype stays self-contained without an
-- external object store. Retention follows the clinical-record rule: RESTRICT on
-- the patient FK and a `deleted_at` soft delete rather than a hard delete.
CREATE TABLE IF NOT EXISTS patient_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  appointment_id   uuid REFERENCES appointments(id) ON DELETE SET NULL,  -- consultation it was attached during (optional)
  title            text NOT NULL,
  description      text,
  category         text NOT NULL DEFAULT 'other'
                   CHECK (category IN ('xray','mri','ct','ultrasound','lab','prescription','referral','discharge','other')),
  file_name        text NOT NULL,
  mime_type        text NOT NULL,
  file_size        integer NOT NULL CHECK (file_size >= 0),
  content          bytea NOT NULL,                       -- the raw file bytes
  uploaded_by_role text NOT NULL CHECK (uploaded_by_role IN ('doctor','patient','receptionist')),
  uploaded_by_id   uuid,                                 -- doctor/patient/receptionist id (NULL if unknown)
  uploaded_by_name text NOT NULL,                        -- display label ("Dr. Braun" / patient name)
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz                           -- soft delete (legal retention)
);

-- ──────────────────────────────── INDEXES ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profile_proposals_patient   ON profile_change_proposals(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient   ON patient_allergies(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_conditions_patient  ON patient_conditions(patient_id);
CREATE INDEX IF NOT EXISTS idx_medications_patient         ON medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_surgeries_patient           ON surgeries(patient_id);
CREATE INDEX IF NOT EXISTS idx_vitals_patient_time         ON vitals(patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_time    ON appointments(doctor_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_patient        ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status         ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_medical_reports_patient     ON medical_reports(patient_id);
-- Retraction (soft-delete) of finalized reports — legally retained, hidden from
-- lists. Draft reports are instead hard-deleted. (Feature: report removal.)
ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE medical_reports ADD COLUMN IF NOT EXISTS deletion_reason text;

CREATE INDEX IF NOT EXISTS idx_medical_reports_appointment ON medical_reports(appointment_id);
CREATE INDEX IF NOT EXISTS idx_report_billing_codes_report ON report_billing_codes(report_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient            ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status             ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_patient_documents_patient   ON patient_documents(patient_id, created_at DESC);
