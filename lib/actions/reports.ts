"use server"

/**
 * Medical report authoring (Feature 9 — Document Consultation & Report
 * Generation, UC-DOC-01) and billing-code attachment (Feature 14 — AI Billing
 * Code Suggestion, UC-DOC-06).
 *
 * Workflow states: `draft` → `pending_approval` → `approved`.
 *
 *  - REQ-DOC-01/02: raw notes and the AI-formatted report are both stored; the
 *    raw notes are always retained for audit (BR-02-02).
 *  - REQ-DOC-04: explicit approval is required to finalise a report.
 *  - BR-02-06: once approved, a report is immutable — `updateReport` refuses to
 *    modify it.
 *  - REQ-BIL-03/04: billing codes are attached under a human-in-the-loop model;
 *    they are persisted only when the Doctor confirms the selection.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { query, withTransaction } from "@/lib/db"
import { getCurrentDoctor } from "@/lib/queries"
import { reportRemovalMode } from "@/lib/rules"
import { isEmailConfigured, sendReportReadyEmail, appUrl } from "@/lib/email"
import { requireDoctor } from "@/lib/auth/guard"
import type { MedicalReportRow, ReportBillingCodeRow } from "@/lib/seed-data"
import { ok, fail, type ActionResult } from "./types"

const prescriptionSchema = z.object({
  medication: z.string().trim(),
  dosage: z.string().trim(),
  frequency: z.string().trim(),
})

const createSchema = z.object({
  appointment_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  diagnosis: z.string().trim().optional(),
  doctor_id: z.string().uuid(),
  raw_notes: z.string().trim().optional(),
  formatted_report: z.string().trim().optional(),
  internal_notes: z.string().trim().optional(),
  prescriptions: z.array(prescriptionSchema).optional(),
  status: z.enum(["draft", "pending_approval"]).default("draft"),
})

export type CreateReportInput = z.infer<typeof createSchema>

/**
 * Create a report. Supports both the AI path (a `formatted_report` is supplied)
 * and the "Save Raw Notes" path (only `raw_notes`), per UC-DOC-01 alternate
 * flow. Reports begin as a draft unless explicitly submitted for approval.
 */
export async function createReport(
  input: CreateReportInput,
): Promise<ActionResult<MedicalReportRow>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return fail("Invalid report payload.")
  const d = parsed.data

  // The author is taken from the signed-in doctor, not from the request payload.
  const result = await query<MedicalReportRow>(
    `INSERT INTO medical_reports
       (appointment_id, patient_id, doctor_id, diagnosis, raw_notes,
        formatted_report, internal_notes, prescriptions, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     RETURNING *`,
    [
      d.appointment_id, d.patient_id, g.value.profileId,
      d.diagnosis ?? null, d.raw_notes ?? null, d.formatted_report ?? null,
      d.internal_notes ?? null,
      d.prescriptions ? JSON.stringify(d.prescriptions) : null,
      d.status,
    ],
  )
  revalidatePath("/doctor")
  return ok(result.rows[0])
}

const updateSchema = z.object({
  diagnosis: z.string().trim().optional(),
  raw_notes: z.string().trim().optional(),
  formatted_report: z.string().trim().optional(),
  internal_notes: z.string().trim().optional(),
  prescriptions: z.array(prescriptionSchema).optional(),
  status: z.enum(["draft", "pending_approval"]).optional(),
})

/**
 * Update a report that has not yet been approved. Approved reports are
 * immutable (BR-02-06) and the update is rejected.
 */
export async function updateReport(
  id: string,
  input: z.infer<typeof updateSchema>,
): Promise<ActionResult<MedicalReportRow>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return fail("Invalid update payload.")

  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return fail("No fields to update.")

  const sets: string[] = []
  const values: unknown[] = []
  for (const [column, value] of entries) {
    if (column === "prescriptions") {
      values.push(JSON.stringify(value))
      sets.push(`prescriptions = $${values.length}::jsonb`)
    } else {
      values.push(value)
      sets.push(`${column} = $${values.length}`)
    }
  }
  values.push(id)
  const idParam = values.length
  values.push(g.value.profileId)
  const doctorParam = values.length

  // The WHERE clause enforces immutability (approved rows never match) AND
  // authorship (a doctor can only edit their own reports).
  const result = await query<MedicalReportRow>(
    `UPDATE medical_reports SET ${sets.join(", ")}
     WHERE id = $${idParam} AND doctor_id = $${doctorParam} AND status <> 'approved'
     RETURNING *`,
    values,
  )
  if (result.rowCount === 0) {
    return fail("Report not found, not yours, or it has already been approved and is locked.")
  }
  revalidatePath("/doctor")
  return ok(result.rows[0])
}

/**
 * Finalise a report (REQ-DOC-04). Sets the status to `approved` and stamps the
 * approval time, after which the record becomes immutable.
 */
export async function approveReport(id: string): Promise<ActionResult<MedicalReportRow>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  const result = await query<MedicalReportRow>(
    `UPDATE medical_reports
     SET status = 'approved', approved_at = now()
     WHERE id = $1 AND doctor_id = $2 AND status <> 'approved'
     RETURNING *`,
    [id, g.value.profileId],
  )
  if (result.rowCount === 0) return fail("Report not found, not yours, or already approved.")

  // Let the patient know a new report is available (best-effort; never blocks).
  if (isEmailConfigured()) {
    try {
      const p = await query<{ email: string | null; first_name: string }>(
        `SELECT email, first_name FROM patients WHERE id = $1`,
        [result.rows[0].patient_id],
      )
      const patient = p.rows[0]
      if (patient?.email) {
        await sendReportReadyEmail({
          to: patient.email, firstName: patient.first_name, portalUrl: await appUrl("/patient/records"),
        })
      }
    } catch { /* email is best-effort */ }
  }

  revalidatePath("/doctor")
  revalidatePath("/patient/records")
  return ok(result.rows[0])
}

const billingCodeSchema = z.object({
  catalog: z.enum(["EBM", "GOAE"]),
  code: z.string().trim().min(1),
  multiplier: z.number().positive().nullable().optional(),
})

/**
 * Replace the full set of billing codes attached to a report (Feature 14).
 * Runs in a transaction so the report never has a partially-updated code set.
 * GOÄ codes carry a multiplier (Steigerungssatz); EBM codes do not.
 */
export async function setReportBillingCodes(
  reportId: string,
  codes: z.infer<typeof billingCodeSchema>[],
): Promise<ActionResult<ReportBillingCodeRow[]>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  const parsed = z.array(billingCodeSchema).safeParse(codes)
  if (!parsed.success) return fail("Invalid billing codes.")

  // Only the authoring doctor may attach codes to their own report.
  const owns = await query(`SELECT 1 FROM medical_reports WHERE id = $1 AND doctor_id = $2`, [reportId, g.value.profileId])
  if (owns.rowCount === 0) return fail("Report not found or not yours.")

  const saved = await withTransaction(async (client) => {
    await client.query(`DELETE FROM report_billing_codes WHERE report_id = $1`, [reportId])
    const out: ReportBillingCodeRow[] = []
    for (const c of parsed.data) {
      const multiplier = c.catalog === "GOAE" ? c.multiplier ?? null : null
      const r = await client.query<ReportBillingCodeRow>(
        `INSERT INTO report_billing_codes (report_id, catalog, code, multiplier)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [reportId, c.catalog, c.code, multiplier],
      )
      out.push(r.rows[0])
    }
    return out
  })

  revalidatePath("/doctor")
  return ok(saved)
}

/**
 * Remove a report (two-tier, German retention law).
 *  - A draft / pending-approval report is not yet part of the legal record, so
 *    it is HARD-deleted (with its attached billing codes) — for genuine mistakes.
 *  - An approved report is legally retained: it is RETRACTED (soft-deleted with a
 *    reason and hidden from lists), never erased.
 * Only the authoring doctor may do this (role-appropriate).
 */
export async function deleteReport(
  reportId: string,
  reason: string,
): Promise<ActionResult<{ action: "deleted" | "retracted" }>> {
  if (!reason.trim()) return fail("A reason is required.")
  const doctor = await getCurrentDoctor()
  if (!doctor) return fail("Only a doctor can remove a report.")

  const res = await query<MedicalReportRow>(`SELECT * FROM medical_reports WHERE id = $1`, [reportId])
  const report = res.rows[0]
  if (!report) return fail("Report not found.")
  if (report.deleted_at) return fail("This report has already been retracted.")
  if (report.doctor_id !== doctor.id) return fail("You can only remove reports you authored.")

  if (reportRemovalMode(report.status) === "retract") {
    // Legally retained → retract (soft), keep the row + codes.
    await query(
      `UPDATE medical_reports SET deleted_at = now(), deletion_reason = $2 WHERE id = $1`,
      [reportId, reason.trim()],
    )
    revalidatePath("/doctor")
    revalidatePath("/patient/records")
    return ok({ action: "retracted" })
  }

  // Draft / pending → hard delete (codes first to satisfy ON DELETE RESTRICT).
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM report_billing_codes WHERE report_id = $1`, [reportId])
    await client.query(`DELETE FROM medical_reports WHERE id = $1`, [reportId])
  })
  revalidatePath("/doctor")
  return ok({ action: "deleted" })
}
