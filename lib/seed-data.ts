/**
 * seed-data.ts — DB-shaped seed data (normalized relational, NOT FHIR)
 * ---------------------------------------------------------------------
 * This file is the "correct table" version of the demo data. Each export is
 * ONE table: a flat array of rows whose fields map 1:1 to columns you create
 * in Postgres. Column types are noted in the comment above each table so you
 * can write the CREATE TABLE statements yourself.
 *
 * Design choices (kept deliberately lean for a thesis prototype):
 *  - No FHIR. Plain normalized tables. The `patients` table stays SHORT;
 *    everything else (allergies, conditions, meds, surgeries, vitals) lives in
 *    small child tables linked by patient_id.
 *  - VITALS are per-visit measurements (a time series), so they get their own
 *    table keyed by patient_id + appointment_id + recorded_at. "Current vitals"
 *    = the most recent row for that patient. Nothing is hard-coded on the patient.
 *  - IDs are shown as readable strings here; in Postgres make them
 *    `uuid DEFAULT gen_random_uuid()` and let the DB generate them.
 *  - Dates are ISO strings (DB-friendly). Use `date` or `timestamptz` columns.
 *  - Money is stored in CENTS (integer) to avoid float rounding — German
 *    invoicing requirement.
 *  - NOTE on German law: do NOT use ON DELETE CASCADE for patient clinical
 *    rows — §630f BGB requires ~10-year retention. Prefer a `deleted_at` soft
 *    delete. (Left out of these sample rows for brevity.)
 *
 * The app's UI still uses lib/mock-data.ts; this file is purely for seeding
 *  real database.
 */

// ───────────────────────────────────────────────────────────────────────────
// LOOKUP TABLES (static German rulebooks). Only a few sample rows here — load
// the full official catalogs (ICD-10-GM, EBM, GOÄ, PZN) into these tables.
// ───────────────────────────────────────────────────────────────────────────

/** icd_10_gm: code TEXT PK, description TEXT */
export interface Icd10Row { code: string; description: string }
export const icd_10_gm: Icd10Row[] = [
  { code: "I10", description: "Essentielle (primäre) Hypertonie" },
  { code: "E11.9", description: "Diabetes mellitus, Typ 2, ohne Komplikationen" },
  { code: "J45.9", description: "Asthma, nicht näher bezeichnet" },
  { code: "J44.9", description: "Chronische obstruktive Lungenkrankheit (COPD)" },
  { code: "E78.5", description: "Hyperlipidämie, nicht näher bezeichnet" },
]

/** ebm_catalog (public/GKV): code TEXT PK, description TEXT, fee_in_cents INT */
export interface EbmRow { code: string; description: string; fee_in_cents: number }
export const ebm_catalog: EbmRow[] = [
  { code: "03000", description: "Versichertenpauschale (Hausarzt)", fee_in_cents: 2350 },
  { code: "03040", description: "Hausärztliche Chronikerpauschale", fee_in_cents: 1580 },
  { code: "03220", description: "Zuschlag chronische Erkrankung", fee_in_cents: 1320 },
]

/** goae_catalog (private/PKV): code TEXT PK, description TEXT,
 *  base_cents INT (1.0x Punktwert), default_multiplier NUMERIC(3,1) */
export interface GoaeRow { code: string; description: string; base_cents: number; default_multiplier: number }
export const goae_catalog: GoaeRow[] = [
  { code: "1", description: "Beratung", base_cents: 466, default_multiplier: 2.3 },
  { code: "5", description: "Symptombezogene Untersuchung", base_cents: 466, default_multiplier: 2.3 },
  { code: "7", description: "Vollständige körperliche Untersuchung", base_cents: 933, default_multiplier: 2.3 },
  { code: "651", description: "Elektrokardiographische Untersuchung (EKG)", base_cents: 1457, default_multiplier: 1.8 },
]

/** medication_pzn: pzn_code TEXT PK, name TEXT, active_ingredient TEXT */
export interface MedicationPznRow { pzn_code: string; name: string; active_ingredient: string }
export const medication_pzn: MedicationPznRow[] = [
  { pzn_code: "03967062", name: "Lisinopril 10mg", active_ingredient: "Lisinopril" },
  { pzn_code: "02091580", name: "Metformin 500mg", active_ingredient: "Metformin" },
  { pzn_code: "06718700", name: "Atorvastatin 20mg", active_ingredient: "Atorvastatin" },
]

// ───────────────────────────────────────────────────────────────────────────
// PEOPLE
// ───────────────────────────────────────────────────────────────────────────

/**
 * doctors
 *  id                 uuid PK
 *  first_name         text
 *  last_name          text
 *  email              text UNIQUE
 *  phone              text
 *  specialization     text
 *  lanr               text         -- Lebenslange Arztnummer (German doctor license)
 *  department         text
 *  max_daily_capacity int          -- for the sick-doctor reassignment AI (BR-18-02)
 *  is_available       boolean
 */
export interface DoctorRow {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  specialization: string
  lanr: string
  department: string
  max_daily_capacity: number
  is_available: boolean
}
export const doctors: DoctorRow[] = [
  { id: "doc-1", first_name: "Sarah", last_name: "Smith", email: "dr.smith@clinic.com", phone: "+49 152 1234567", specialization: "General Practice", lanr: "123456789", department: "General Medicine", max_daily_capacity: 20, is_available: true },
  { id: "doc-2", first_name: "Hans", last_name: "Müller", email: "dr.mueller@clinic.com", phone: "+49 152 2345678", specialization: "Cardiology", lanr: "234567891", department: "Cardiology", max_daily_capacity: 16, is_available: true },
  { id: "doc-3", first_name: "Emily", last_name: "Johnson", email: "dr.johnson@clinic.com", phone: "+49 152 3456789", specialization: "Dermatology", lanr: "345678912", department: "Dermatology", max_daily_capacity: 18, is_available: true },
]

/**
 * receptionists  (clinic staff)
 *  id          uuid PK
 *  first_name  text
 *  last_name   text
 *  email       text UNIQUE
 *  phone       text
 *  department  text
 */
export interface ReceptionistRow {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  department: string
}
export const receptionists: ReceptionistRow[] = [
  { id: "rec-1", first_name: "Maria", last_name: "Braun", email: "reception@clinic.com", phone: "+49 152 1112223", department: "Front Desk" },
]

/**
 * patients  (SHORT — identity + insurance only; clinical data lives in child tables)
 *  id                 uuid PK
 *  first_name         text NOT NULL
 *  last_name          text NOT NULL
 *  birth_date         date NOT NULL
 *  email              text            -- nullable: "analog" patients have none
 *  phone              text
 *  insurance_type     text  -- 'gkv' | 'pkv' | 'selbstzahler'
 *  versicherten_id    text UNIQUE     -- 10-char KVNR; NULL for self-pay
 *  is_digital_active  boolean         -- false = no portal/SMS (BR-08-05)
 *  guardian_contact   text            -- required if under 18 (BR-08-06)
 *  -- address kept as a few flat columns (no need for a separate table at this scale)
 *  street             text
 *  city               text
 *  postal_code        text
 *  country            text
 *  last_updated_by    text            -- audit: 'User: Braun' | 'AI-Module-15' (BR-15-05)
 *  created_at         timestamptz
 *  deleted_at         timestamptz     -- soft delete (legal retention; usually NULL)
 */
export interface PatientRow {
  id: string
  first_name: string
  last_name: string
  birth_date: string
  email: string | null
  phone: string | null
  insurance_type: "gkv" | "pkv" | "selbstzahler"
  versicherten_id: string | null
  is_digital_active: boolean
  guardian_contact: string | null
  street: string | null
  city: string | null
  postal_code: string | null
  country: string | null
  last_updated_by: string
  created_at: string
  deleted_at: string | null
}
export const patients: PatientRow[] = [
  { id: "pat-1", first_name: "Max", last_name: "Mustermann", birth_date: "1985-06-15", email: "max.mustermann@email.com", phone: "+49 152 9876543", insurance_type: "gkv", versicherten_id: "A123456789", is_digital_active: true, guardian_contact: null, street: "Hauptstraße 123", city: "Berlin", postal_code: "10115", country: "Germany", last_updated_by: "User: Braun", created_at: "2022-01-10T09:00:00Z", deleted_at: null },
  { id: "pat-2", first_name: "Anna", last_name: "Schmidt", birth_date: "1990-03-22", email: "anna.schmidt@email.com", phone: "+49 152 7654321", insurance_type: "pkv", versicherten_id: null, is_digital_active: true, guardian_contact: null, street: "Friedrichstraße 45", city: "Berlin", postal_code: "10117", country: "Germany", last_updated_by: "User: Braun", created_at: "2022-05-20T09:00:00Z", deleted_at: null },
  { id: "pat-3", first_name: "Thomas", last_name: "Müller", birth_date: "1978-11-08", email: "thomas.mueller@email.com", phone: "+49 152 6543210", insurance_type: "gkv", versicherten_id: "A987654321", is_digital_active: true, guardian_contact: null, street: "Alexanderplatz 10", city: "Berlin", postal_code: "10178", country: "Germany", last_updated_by: "User: Braun", created_at: "2021-08-15T09:00:00Z", deleted_at: null },
  { id: "pat-4", first_name: "Lisa", last_name: "Weber", birth_date: "1995-07-30", email: "lisa.weber@email.com", phone: "+49 152 5432109", insurance_type: "selbstzahler", versicherten_id: null, is_digital_active: true, guardian_contact: null, street: "Potsdamer Platz 5", city: "Berlin", postal_code: "10785", country: "Germany", last_updated_by: "User: Braun", created_at: "2023-11-01T09:00:00Z", deleted_at: null },
  { id: "pat-5", first_name: "Peter", last_name: "Fischer", birth_date: "1960-02-14", email: "peter.fischer@email.com", phone: "+49 152 4321098", insurance_type: "gkv", versicherten_id: "A111222333", is_digital_active: true, guardian_contact: null, street: "Unter den Linden 77", city: "Berlin", postal_code: "10117", country: "Germany", last_updated_by: "User: Braun", created_at: "2019-03-10T09:00:00Z", deleted_at: null },
]

// ───────────────────────────────────────────────────────────────────────────
// PATIENT CLINICAL CHILD TABLES (this is why `patients` stays short)
// ───────────────────────────────────────────────────────────────────────────

/**
 * patient_allergies
 *  id          uuid PK
 *  patient_id  uuid FK -> patients(id)
 *  substance   text          -- e.g. 'Penicillin'
 *  recorded_at timestamptz
 */
export interface PatientAllergyRow { id: string; patient_id: string; substance: string; recorded_at: string }
export const patient_allergies: PatientAllergyRow[] = [
  { id: "alg-1", patient_id: "pat-1", substance: "Penicillin", recorded_at: "2022-01-10T09:00:00Z" },
  { id: "alg-2", patient_id: "pat-3", substance: "Aspirin", recorded_at: "2021-08-15T09:00:00Z" },
  { id: "alg-3", patient_id: "pat-3", substance: "Ibuprofen", recorded_at: "2021-08-15T09:00:00Z" },
  { id: "alg-4", patient_id: "pat-5", substance: "Sulfonamide", recorded_at: "2019-03-10T09:00:00Z" },
]

/**
 * patient_conditions  (chronic conditions; icd10_code links to the rulebook)
 *  id          uuid PK
 *  patient_id  uuid FK -> patients(id)
 *  icd10_code  text FK -> icd_10_gm(code)
 *  label       text          -- human-readable, optional convenience copy
 *  recorded_at timestamptz
 */
export interface PatientConditionRow { id: string; patient_id: string; icd10_code: string; label: string; recorded_at: string }
export const patient_conditions: PatientConditionRow[] = [
  { id: "cond-1", patient_id: "pat-1", icd10_code: "I10", label: "Hypertension", recorded_at: "2022-01-10T09:00:00Z" },
  { id: "cond-2", patient_id: "pat-3", icd10_code: "E11.9", label: "Type 2 Diabetes", recorded_at: "2021-08-15T09:00:00Z" },
  { id: "cond-3", patient_id: "pat-3", icd10_code: "E78.5", label: "High Cholesterol", recorded_at: "2021-08-15T09:00:00Z" },
  { id: "cond-4", patient_id: "pat-5", icd10_code: "J44.9", label: "COPD", recorded_at: "2019-03-10T09:00:00Z" },
  { id: "cond-5", patient_id: "pat-5", icd10_code: "I10", label: "Hypertension", recorded_at: "2019-03-10T09:00:00Z" },
]

/**
 * medications  (active prescriptions; pzn links to e-Rezept rulebook)
 *  id          uuid PK
 *  patient_id  uuid FK -> patients(id)
 *  pzn_code    text FK -> medication_pzn(pzn_code)   -- nullable if not coded yet
 *  name        text
 *  dosage      text
 *  frequency   text
 *  start_date  date
 *  end_date    date          -- NULL = ongoing
 */
export interface MedicationRow {
  id: string; patient_id: string; pzn_code: string | null
  name: string; dosage: string; frequency: string; start_date: string; end_date: string | null
}
export const medications: MedicationRow[] = [
  { id: "med-1", patient_id: "pat-1", pzn_code: "03967062", name: "Lisinopril", dosage: "10mg", frequency: "Once daily", start_date: "2023-01-01", end_date: null },
  { id: "med-2", patient_id: "pat-3", pzn_code: "02091580", name: "Metformin", dosage: "500mg", frequency: "Twice daily", start_date: "2021-06-15", end_date: null },
  { id: "med-3", patient_id: "pat-3", pzn_code: "06718700", name: "Atorvastatin", dosage: "20mg", frequency: "Once daily", start_date: "2022-03-01", end_date: null },
  { id: "med-4", patient_id: "pat-5", pzn_code: null, name: "Tiotropium", dosage: "18mcg", frequency: "Once daily", start_date: "2020-01-15", end_date: null },
  { id: "med-5", patient_id: "pat-5", pzn_code: null, name: "Amlodipine", dosage: "5mg", frequency: "Once daily", start_date: "2019-06-01", end_date: null },
]

/**
 * surgeries  (past surgeries)
 *  id          uuid PK
 *  patient_id  uuid FK -> patients(id)
 *  name        text
 *  surgery_date date
 *  notes       text
 */
export interface SurgeryRow { id: string; patient_id: string; name: string; surgery_date: string; notes: string | null }
export const surgeries: SurgeryRow[] = [
  { id: "surg-1", patient_id: "pat-3", name: "Appendectomy", surgery_date: "2010-08-20", notes: "Routine procedure, no complications" },
]

/**
 * vitals  ⭐ per-visit measurements (a time series, NOT static patient fields)
 *  id            uuid PK
 *  patient_id    uuid FK -> patients(id)
 *  appointment_id uuid FK -> appointments(id)   -- the visit it was taken at
 *  recorded_at   timestamptz
 *  height_cm     int
 *  weight_kg     numeric(5,1)
 *  systolic      int          -- blood pressure
 *  diastolic     int
 *  heart_rate    int          -- bpm
 *  temperature_c numeric(3,1)
 *  -- "current vitals" for a patient = the row with the latest recorded_at
 */
export interface VitalsRow {
  id: string; patient_id: string; appointment_id: string | null; recorded_at: string
  height_cm: number | null; weight_kg: number | null
  systolic: number | null; diastolic: number | null
  heart_rate: number | null; temperature_c: number | null
}
export const vitals: VitalsRow[] = [
  { id: "vit-1", patient_id: "pat-3", appointment_id: "apt-3", recorded_at: "2024-01-15T08:30:00Z", height_cm: 178, weight_kg: 84.5, systolic: 128, diastolic: 82, heart_rate: 74, temperature_c: 36.7 },
  { id: "vit-2", patient_id: "pat-1", appointment_id: null, recorded_at: "2025-10-12T10:00:00Z", height_cm: 182, weight_kg: 79.0, systolic: 122, diastolic: 78, heart_rate: 68, temperature_c: 36.6 },
  { id: "vit-3", patient_id: "pat-5", appointment_id: null, recorded_at: "2024-01-02T11:00:00Z", height_cm: 170, weight_kg: 71.2, systolic: 140, diastolic: 90, heart_rate: 80, temperature_c: 36.8 },
]

// ───────────────────────────────────────────────────────────────────────────
// SCHEDULING / CLINICAL EVENTS
// ───────────────────────────────────────────────────────────────────────────

/**
 * appointments  (scheduling + status workflow; merges the FHIR "encounter")
 *  id            uuid PK
 *  patient_id    uuid FK -> patients(id)
 *  doctor_id     uuid FK -> doctors(id)
 *  starts_at     timestamptz
 *  duration_min  int
 *  status        text  -- 'scheduled'|'waiting'|'in_progress'|'completed'|'cancelled'|'no_show'
 *  reason        text
 *  reason_for_change text     -- required when staff reschedules/cancels (BR-09-02)
 *  check_in_at   timestamptz  -- arrival timestamp (BR-07-06)
 *  doctor_notes  text         -- raw notes the doctor typed (AI reads this)
 *  created_at    timestamptz
 */
export type AppointmentStatusDb =
  | "scheduled" | "waiting" | "in_progress" | "completed" | "cancelled" | "no_show"
export interface AppointmentRow {
  id: string
  patient_id: string
  doctor_id: string
  starts_at: string
  duration_min: number
  status: AppointmentStatusDb
  reason: string
  reason_for_change: string | null
  check_in_at: string | null
  doctor_notes: string | null
  created_at: string
}
export const appointments: AppointmentRow[] = [
  { id: "apt-1", patient_id: "pat-1", doctor_id: "doc-1", starts_at: "2024-01-15T09:00:00Z", duration_min: 30, status: "scheduled", reason: "General checkup", reason_for_change: null, check_in_at: null, doctor_notes: null, created_at: "2024-01-10T00:00:00Z" },
  { id: "apt-2", patient_id: "pat-2", doctor_id: "doc-2", starts_at: "2024-01-15T09:30:00Z", duration_min: 30, status: "waiting", reason: "Heart palpitations", reason_for_change: null, check_in_at: "2024-01-15T09:15:00Z", doctor_notes: null, created_at: "2024-01-08T00:00:00Z" },
  { id: "apt-3", patient_id: "pat-3", doctor_id: "doc-1", starts_at: "2024-01-15T08:30:00Z", duration_min: 30, status: "completed", reason: "Diabetes follow-up", reason_for_change: null, check_in_at: "2024-01-15T08:20:00Z", doctor_notes: "Blood sugar levels stable. Continue current medication.", created_at: "2024-01-05T00:00:00Z" },
  { id: "apt-4", patient_id: "pat-4", doctor_id: "doc-1", starts_at: "2024-01-15T10:00:00Z", duration_min: 30, status: "scheduled", reason: "Skin rash consultation", reason_for_change: null, check_in_at: null, doctor_notes: null, created_at: "2024-01-12T00:00:00Z" },
  { id: "apt-5", patient_id: "pat-5", doctor_id: "doc-2", starts_at: "2024-01-15T10:30:00Z", duration_min: 30, status: "scheduled", reason: "COPD management", reason_for_change: null, check_in_at: null, doctor_notes: null, created_at: "2024-01-11T00:00:00Z" },
]

/**
 * medical_reports  (Feature 2 output; immutable after approval — BR-02-06)
 *  id               uuid PK
 *  appointment_id   uuid FK -> appointments(id)
 *  patient_id       uuid FK -> patients(id)
 *  doctor_id        uuid FK -> doctors(id)
 *  diagnosis        text
 *  raw_notes        text        -- always retained for audit (BR-02-02)
 *  formatted_report text        -- AI-structured version
 *  internal_notes   text        -- staff-only; stripped before AI simplification (BR-14-06)
 *  status           text  -- 'draft'|'pending_approval'|'approved'
 *  approved_at      timestamptz
 *  version          int
 *  created_at       timestamptz
 */
export interface PrescriptionItem { medication: string; dosage: string; frequency: string }

export interface MedicalReportRow {
  id: string
  appointment_id: string
  patient_id: string
  doctor_id: string
  diagnosis: string
  raw_notes: string | null
  formatted_report: string | null
  internal_notes: string | null
  prescriptions?: PrescriptionItem[] | null
  status: "draft" | "pending_approval" | "approved"
  approved_at: string | null
  version: number
  created_at: string
}
export const medical_reports: MedicalReportRow[] = [
  { id: "rep-1", appointment_id: "apt-3", patient_id: "pat-3", doctor_id: "doc-1", diagnosis: "Type 2 Diabetes Mellitus - Well Controlled", raw_notes: "Routine diabetes follow-up. Improved energy. HbA1c 6.8%.", formatted_report: "Assessment: T2DM well controlled. Plan: continue Metformin 500mg BID; follow-up 3 months.", internal_notes: null, status: "approved", approved_at: "2024-01-15T09:00:00Z", version: 1, created_at: "2024-01-15T08:45:00Z" },
  { id: "rep-2", appointment_id: "apt-3", patient_id: "pat-1", doctor_id: "doc-1", diagnosis: "Routine Bloodwork - Normal Results", raw_notes: "Annual screening bloodwork. All values within normal range.", formatted_report: null, internal_notes: null, status: "approved", approved_at: "2025-10-12T10:30:00Z", version: 1, created_at: "2025-10-12T10:00:00Z" },
]

/**
 * report_billing_codes  (codes attached to a report; junction to the catalogs)
 *  id          uuid PK
 *  report_id   uuid FK -> medical_reports(id)
 *  catalog     text  -- 'EBM' | 'GOAE'
 *  code        text  -- FK -> ebm_catalog(code) OR goae_catalog(code)
 *  multiplier  numeric(3,1)   -- GOÄ only (Steigerungssatz); NULL for EBM
 */
export interface ReportBillingCodeRow {
  id: string; report_id: string; catalog: "EBM" | "GOAE"; code: string; multiplier: number | null
}
export const report_billing_codes: ReportBillingCodeRow[] = [
  { id: "rbc-1", report_id: "rep-1", catalog: "EBM", code: "03000", multiplier: null },
  { id: "rbc-2", report_id: "rep-1", catalog: "EBM", code: "03040", multiplier: null },
]

/**
 * invoices  (Feature 3; sequential number is a legal requirement — §14 UStG/GoBD)
 *  id             uuid PK
 *  invoice_number text UNIQUE     -- sequential, no gaps
 *  appointment_id uuid FK -> appointments(id)
 *  patient_id     uuid FK -> patients(id)
 *  insurance_type text  -- 'gkv'|'pkv'|'selbstzahler'
 *  total_cents    int            -- only for pkv/selbstzahler; NULL for gkv
 *  status         text  -- 'ready_for_kv'|'pending_payment'|'sent'|'paid'|'storno'
 *  storno_of      uuid FK -> invoices(id)  -- cancellation invoice link (BR-03-03)
 *  due_date       date
 *  created_at     timestamptz
 */
export interface InvoiceRow {
  id: string
  invoice_number: string
  appointment_id: string
  patient_id: string
  insurance_type: "gkv" | "pkv" | "selbstzahler"
  total_cents: number | null
  status: "ready_for_kv" | "pending_payment" | "sent" | "paid" | "storno"
  storno_of: string | null
  due_date: string | null
  created_at: string
}
export const invoices: InvoiceRow[] = [
  { id: "inv-1", invoice_number: "2024-0001", appointment_id: "apt-3", patient_id: "pat-3", insurance_type: "gkv", total_cents: null, status: "ready_for_kv", storno_of: null, due_date: null, created_at: "2024-01-15T12:00:00Z" },
  { id: "inv-2", invoice_number: "2024-0002", appointment_id: "apt-3", patient_id: "pat-2", insurance_type: "pkv", total_cents: 7399, status: "sent", storno_of: null, due_date: "2024-02-10", created_at: "2024-01-10T12:00:00Z" },
]
