/**
 * lib/queries.ts — typed data-access layer over the Postgres (Neon) database.
 *
 * These are server-only functions: import them from Server Components, Route
 * Handlers, or Server Actions — never from client components (the pg pool must
 * stay on the server). Row types are reused from lib/seed-data.ts so the DB
 * shape and the seed shape never drift apart.
 *
 * This is the real-data replacement for lib/mock-data.ts. Migrate pages by
 * swapping their mock imports for these functions.
 */
import "server-only"
import { sql } from "./db"
import { getSession } from "./auth/session"
import { getEbmCode } from "./codes/ebm"
import type {
  DoctorRow,
  ReceptionistRow,
  PatientRow,
  PatientAllergyRow,
  PatientConditionRow,
  MedicationRow,
  SurgeryRow,
  VitalsRow,
  AppointmentRow,
  MedicalReportRow,
  ReportBillingCodeRow,
  InvoiceRow,
} from "./seed-data"

// ───────────────────────────── Doctors ─────────────────────────────
export function getDoctors() {
  return sql<DoctorRow>`SELECT * FROM doctors ORDER BY last_name, first_name`
}

export async function getDoctorById(id: string) {
  const rows = await sql<DoctorRow>`SELECT * FROM doctors WHERE id = ${id}`
  return rows[0] ?? null
}

// ────────────────────────── Receptionists ──────────────────────────
export function getReceptionists() {
  return sql<ReceptionistRow>`SELECT * FROM receptionists ORDER BY last_name`
}

export async function getReceptionistById(id: string) {
  const rows = await sql<ReceptionistRow>`SELECT * FROM receptionists WHERE id = ${id}`
  return rows[0] ?? null
}

// ───────────────────────────── Patients ────────────────────────────
/** Active (non-soft-deleted) patients. */
export function getPatients() {
  return sql<PatientRow>`
    SELECT * FROM patients
    WHERE deleted_at IS NULL
    ORDER BY last_name, first_name`
}

export async function getPatientById(id: string) {
  const rows = await sql<PatientRow>`
    SELECT * FROM patients WHERE id = ${id} AND deleted_at IS NULL`
  return rows[0] ?? null
}

/** Everything a doctor's "Patient Briefing" panel needs in one call. */
export async function getPatientClinical(patientId: string) {
  const [allergies, conditions, medications, surgeries, latestVitals] =
    await Promise.all([
      sql<PatientAllergyRow>`
        SELECT * FROM patient_allergies WHERE patient_id = ${patientId}
        ORDER BY recorded_at DESC`,
      sql<PatientConditionRow>`
        SELECT * FROM patient_conditions WHERE patient_id = ${patientId}
        ORDER BY recorded_at DESC`,
      sql<MedicationRow>`
        SELECT * FROM medications WHERE patient_id = ${patientId}
        ORDER BY start_date DESC NULLS LAST`,
      sql<SurgeryRow>`
        SELECT * FROM surgeries WHERE patient_id = ${patientId}
        ORDER BY surgery_date DESC NULLS LAST`,
      sql<VitalsRow>`
        SELECT * FROM vitals WHERE patient_id = ${patientId}
        ORDER BY recorded_at DESC LIMIT 1`,
    ])
  return {
    allergies,
    conditions,
    medications,
    surgeries,
    currentVitals: latestVitals[0] ?? null,
  }
}

// ──────────────────────────── Appointments ─────────────────────────
/** Appointment joined with patient & doctor display names (handy for lists). */
export interface AppointmentWithNames extends AppointmentRow {
  patient_name: string
  doctor_name: string
}

export function getAppointments() {
  return sql<AppointmentWithNames>`
    SELECT a.*,
           p.first_name || ' ' || p.last_name AS patient_name,
           'Dr. ' || d.last_name              AS doctor_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors  d ON d.id = a.doctor_id
    ORDER BY a.starts_at`
}

/** A single day's schedule (used by the receptionist Daily Schedule view). */
export function getAppointmentsForDay(day: string /* 'YYYY-MM-DD' */) {
  return sql<AppointmentWithNames>`
    SELECT a.*,
           p.first_name || ' ' || p.last_name AS patient_name,
           'Dr. ' || d.last_name              AS doctor_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors  d ON d.id = a.doctor_id
    WHERE a.starts_at::date = ${day}::date
    ORDER BY a.starts_at`
}

export function getAppointmentsByDoctor(doctorId: string) {
  return sql<AppointmentWithNames>`
    SELECT a.*,
           p.first_name || ' ' || p.last_name AS patient_name,
           'Dr. ' || d.last_name              AS doctor_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors  d ON d.id = a.doctor_id
    WHERE a.doctor_id = ${doctorId}
    ORDER BY a.starts_at`
}

export function getAppointmentsByPatient(patientId: string) {
  return sql<AppointmentRow>`
    SELECT * FROM appointments WHERE patient_id = ${patientId}
    ORDER BY starts_at DESC`
}

export async function getAppointmentById(id: string) {
  const rows = await sql<AppointmentWithNames>`
    SELECT a.*,
           p.first_name || ' ' || p.last_name AS patient_name,
           'Dr. ' || d.last_name              AS doctor_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors  d ON d.id = a.doctor_id
    WHERE a.id = ${id}`
  return rows[0] ?? null
}

// ────────────────────────── Medical reports ────────────────────────
export function getReportsByPatient(patientId: string) {
  return sql<MedicalReportRow>`
    SELECT * FROM medical_reports WHERE patient_id = ${patientId} AND deleted_at IS NULL
    ORDER BY created_at DESC`
}

export async function getReportById(id: string) {
  const rows = await sql<MedicalReportRow>`
    SELECT * FROM medical_reports WHERE id = ${id}`
  return rows[0] ?? null
}

/** The (single) report belonging to an appointment — for resuming a draft. */
export async function getReportByAppointment(appointmentId: string) {
  const rows = await sql<MedicalReportRow>`
    SELECT * FROM medical_reports WHERE appointment_id = ${appointmentId} AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 1`
  return rows[0] ?? null
}

/** The vitals recorded during a specific appointment (for the consultation). */
export async function getVitalsByAppointment(appointmentId: string) {
  const rows = await sql<VitalsRow>`
    SELECT * FROM vitals WHERE appointment_id = ${appointmentId}
    ORDER BY recorded_at DESC LIMIT 1`
  return rows[0] ?? null
}

/** A patient's recorded vitals over time (newest first) — for AI context. */
export function getVitalsByPatient(patientId: string) {
  return sql<VitalsRow>`
    SELECT * FROM vitals WHERE patient_id = ${patientId}
    ORDER BY recorded_at DESC`
}

/** Billing codes attached to a report (joined with catalog descriptions). */
export interface ReportBillingCodeDetail extends ReportBillingCodeRow {
  description: string | null
}

export function getBillingCodesForReport(reportId: string) {
  return sql<ReportBillingCodeDetail>`
    SELECT rbc.*,
           COALESCE(ebm.description, goae.description) AS description
    FROM report_billing_codes rbc
    LEFT JOIN ebm_catalog  ebm  ON rbc.catalog = 'EBM'  AND ebm.code  = rbc.code
    LEFT JOIN goae_catalog goae ON rbc.catalog = 'GOAE' AND goae.code = rbc.code
    WHERE rbc.report_id = ${reportId}`
}

// ─────────────────────────────── Invoices ──────────────────────────
export function getInvoices() {
  return sql<InvoiceRow>`SELECT * FROM invoices ORDER BY invoice_number DESC`
}

export function getInvoicesByPatient(patientId: string) {
  return sql<InvoiceRow>`
    SELECT * FROM invoices WHERE patient_id = ${patientId}
    ORDER BY invoice_number DESC`
}

/** The active (non-cancelled) invoice for a visit — for the consultation record. */
export async function getInvoiceByAppointment(appointmentId: string) {
  const rows = await sql<InvoiceRow>`
    SELECT * FROM invoices WHERE appointment_id = ${appointmentId} AND status <> 'storno'
    ORDER BY created_at DESC LIMIT 1`
  return rows[0] ?? null
}

// ─────────────────────────── Billing (Feature 3) ───────────────────────────

/** One completed appointment in the receptionist's billing worklist. */
export interface BillingWorklistRow {
  appointment_id: string
  starts_at: string
  patient_id: string
  patient_name: string
  insurance_type: PatientRow["insurance_type"]
  code_count: number
  invoice_id: string | null
  invoice_status: InvoiceRow["status"] | null
}

/** Completed appointments awaiting (or already through) billing finalisation. */
export function getBillingWorklist() {
  return sql<BillingWorklistRow>`
    SELECT a.id AS appointment_id, a.starts_at,
           p.id AS patient_id,
           p.first_name || ' ' || p.last_name AS patient_name,
           p.insurance_type,
           (SELECT count(*)::int FROM report_billing_codes rbc
              JOIN medical_reports mr ON mr.id = rbc.report_id
              WHERE mr.appointment_id = a.id) AS code_count,
           (SELECT i.id FROM invoices i
              WHERE i.appointment_id = a.id AND i.status <> 'storno' LIMIT 1) AS invoice_id,
           (SELECT i.status FROM invoices i
              WHERE i.appointment_id = a.id AND i.status <> 'storno' LIMIT 1) AS invoice_status
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.status = 'completed'
    ORDER BY a.starts_at DESC`
}

/** A single billing line item, with its description and (GOÄ) computed amount. */
export interface BillingItem {
  catalog: "EBM" | "GOAE"
  code: string
  description: string
  points: number | null      // GOÄ Punktzahl (EBM points come from the file)
  multiplier: number | null  // GOÄ Steigerungssatz
  amount_cents: number | null // GOÄ single amount; null for EBM (no € for GKV)
}

interface RawBillingItem {
  catalog: "EBM" | "GOAE"
  code: string
  multiplier: number | null
  goae_desc: string | null
  base_cents: number | null
  default_multiplier: number | null
}

// GOÄ point value (Punktwert) in cents — fixed since 1996.
const GOAE_PUNKTWERT_CENTS = 5.82873

/**
 * Billing items attached to an appointment's report(s). GOÄ descriptions/points
 * come from the catalog table; EBM descriptions are read from the file-based
 * catalog (lib/codes/ebm.ts). GOÄ amounts = base × Steigerungssatz.
 */
export async function getAppointmentBillingItems(appointmentId: string): Promise<BillingItem[]> {
  const rows = await sql<RawBillingItem>`
    SELECT rbc.catalog, rbc.code, rbc.multiplier,
           goae.description AS goae_desc, goae.base_cents, goae.default_multiplier
    FROM report_billing_codes rbc
    JOIN medical_reports mr ON mr.id = rbc.report_id
    LEFT JOIN goae_catalog goae ON rbc.catalog = 'GOAE' AND goae.code = rbc.code
    WHERE mr.appointment_id = ${appointmentId}`

  return rows.map((r) => {
    if (r.catalog === "GOAE") {
      // pg returns numeric columns as strings — coerce so the factor is a number.
      const factor = Number(r.multiplier ?? r.default_multiplier ?? 1)
      return {
        catalog: "GOAE" as const,
        code: r.code,
        description: r.goae_desc ?? `GOÄ ${r.code}`,
        points: r.base_cents != null ? Math.round(r.base_cents / GOAE_PUNKTWERT_CENTS) : null,
        multiplier: factor,
        amount_cents: r.base_cents != null ? Math.round(r.base_cents * factor) : null,
      }
    }
    // EBM — description + points from the file-based catalog; no € for GKV.
    const ebm = getEbmCode(r.code)
    return {
      catalog: "EBM" as const,
      code: r.code,
      description: ebm?.description ?? `EBM ${r.code}`,
      points: ebm?.points ?? null,
      multiplier: null,
      amount_cents: null,
    }
  })
}

// ─────────────────────────── Doctor portal lists ───────────────────────────

/** A patient the doctor has treated, with visit summary and allergy flags. */
export interface DoctorPatientRow extends PatientRow {
  last_visit: string | null
  visit_count: number
  allergies: string[]
  condition_count: number
}

/** Patients who have appointments with the given doctor. */
export function getDoctorPatients(doctorId: string) {
  return sql<DoctorPatientRow>`
    SELECT p.*,
           MAX(a.starts_at)         AS last_visit,
           COUNT(DISTINCT a.id)::int AS visit_count,
           COALESCE((SELECT array_agg(pa.substance) FROM patient_allergies pa WHERE pa.patient_id = p.id), '{}') AS allergies,
           (SELECT count(*)::int FROM patient_conditions pc WHERE pc.patient_id = p.id) AS condition_count
    FROM patients p
    JOIN appointments a ON a.patient_id = p.id AND a.doctor_id = ${doctorId}
    WHERE p.deleted_at IS NULL
    GROUP BY p.id
    ORDER BY MAX(a.starts_at) DESC NULLS LAST`
}

/** A medical report joined with the patient name and appointment date. */
export interface ReportListRow extends MedicalReportRow {
  patient_name: string
  patient_dob: string
  starts_at: string
}

/** All reports authored by the given doctor (newest first). */
export function getReportsByDoctor(doctorId: string) {
  return sql<ReportListRow>`
    SELECT mr.*,
           p.first_name || ' ' || p.last_name AS patient_name,
           p.birth_date AS patient_dob,
           a.starts_at
    FROM medical_reports mr
    JOIN patients p     ON p.id = mr.patient_id
    JOIN appointments a ON a.id = mr.appointment_id
    WHERE mr.doctor_id = ${doctorId} AND mr.deleted_at IS NULL
    ORDER BY mr.created_at DESC`
}

/** The doctor's completed consultations, for their billing overview. */
export function getDoctorBillingWorklist(doctorId: string) {
  return sql<BillingWorklistRow>`
    SELECT a.id AS appointment_id, a.starts_at,
           p.id AS patient_id,
           p.first_name || ' ' || p.last_name AS patient_name,
           p.insurance_type,
           (SELECT count(*)::int FROM report_billing_codes rbc
              JOIN medical_reports mr ON mr.id = rbc.report_id
              WHERE mr.appointment_id = a.id) AS code_count,
           (SELECT i.id FROM invoices i
              WHERE i.appointment_id = a.id AND i.status <> 'storno' LIMIT 1) AS invoice_id,
           (SELECT i.status FROM invoices i
              WHERE i.appointment_id = a.id AND i.status <> 'storno' LIMIT 1) AS invoice_status
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.status = 'completed' AND a.doctor_id = ${doctorId}
    ORDER BY a.starts_at DESC`
}

/** Invoice joined with patient + appointment date, for the invoices list. */
export interface InvoiceListRow extends InvoiceRow {
  patient_name: string
  starts_at: string
}

export function getInvoicesDetailed() {
  return sql<InvoiceListRow>`
    SELECT i.*,
           p.first_name || ' ' || p.last_name AS patient_name,
           a.starts_at
    FROM invoices i
    JOIN patients p ON p.id = i.patient_id
    JOIN appointments a ON a.id = i.appointment_id
    ORDER BY i.invoice_number DESC`
}

export async function getInvoiceById(id: string) {
  const rows = await sql<InvoiceListRow>`
    SELECT i.*,
           p.first_name || ' ' || p.last_name AS patient_name,
           a.starts_at
    FROM invoices i
    JOIN patients p ON p.id = i.patient_id
    JOIN appointments a ON a.id = i.appointment_id
    WHERE i.id = ${id}`
  return rows[0] ?? null
}

// ──────────────────── Authenticated "current user" resolvers ────────────────
// Resolve the signed-in user (Feature 1) from the session and load their
// role-specific profile. Role pages are gated by middleware, so within those
// pages the session is guaranteed present and of the correct role.

export async function getCurrentPatient() {
  const session = await getSession()
  if (!session || session.role !== "patient" || !session.profileId) return null
  return getPatientById(session.profileId)
}

export async function getCurrentDoctor() {
  const session = await getSession()
  if (!session || session.role !== "doctor" || !session.profileId) return null
  return getDoctorById(session.profileId)
}

export async function getCurrentReceptionist() {
  const session = await getSession()
  if (!session || session.role !== "receptionist" || !session.profileId) return null
  return getReceptionistById(session.profileId)
}

/** Patient ids that have at least one recorded allergy (for at-a-glance flags). */
export async function getPatientIdsWithAllergies(): Promise<Set<string>> {
  const rows = await sql<{ patient_id: string }>`
    SELECT DISTINCT patient_id FROM patient_allergies`
  return new Set(rows.map((r) => r.patient_id))
}
