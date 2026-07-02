"use server"

/**
 * Invoice generation and billing finalisation (Feature 7 — Invoice Generation
 * & Billing Management, UC-REC-01).
 *
 *  - REQ-REC-02: the workflow branches on the patient's insurance type.
 *      • Public (GKV):  no monetary total and no PDF; the record is flagged
 *        `ready_for_kv` for the quarterly batch submission (Quartalsabrechnung)
 *        — REQ-REC-04.
 *      • Private / Self-pay (PKV/Selbstzahler): the total is calculated from the
 *        attached GOÄ codes and the invoice enters `pending_payment` — REQ-REC-03.
 *  - REQ-REC-05: billing finalisation is blocked when no codes are attached.
 *  - §14 UStG / GoBD: invoice numbers are sequential and gap-free; allocation
 *    happens under an advisory lock inside the transaction so concurrent
 *    finalisations cannot produce duplicate or skipped numbers. A cancellation
 *    is issued as a separate `storno` invoice that references the original
 *    (BR-03-03) — invoices are never deleted.
 */
import { revalidatePath } from "next/cache"
import type { PoolClient } from "pg"
import { query, withTransaction } from "@/lib/db"
import type { InvoiceRow } from "@/lib/seed-data"
import { ok, fail, type ActionResult } from "./types"

// Advisory-lock key dedicated to invoice-number allocation (any stable constant).
const INVOICE_SEQUENCE_LOCK = 778899

// Net payment term for private/self-pay invoices.
const PAYMENT_TERM_DAYS = 14

interface BillingCodeAmount {
  catalog: "EBM" | "GOAE"
  multiplier: number | null
  base_cents: number | null
  default_multiplier: number | null
}

/** Allocate the next gap-free invoice number for the current year (YYYY-NNNN). */
async function allocateInvoiceNumber(client: PoolClient): Promise<string> {
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [INVOICE_SEQUENCE_LOCK])
  const year = new Date().getFullYear()
  const last = await client.query<{ invoice_number: string }>(
    `SELECT invoice_number FROM invoices
     WHERE invoice_number LIKE $1
     ORDER BY invoice_number DESC LIMIT 1`,
    [`${year}-%`],
  )
  const lastSeq = last.rowCount ? parseInt(last.rows[0].invoice_number.split("-")[1], 10) : 0
  return `${year}-${String(lastSeq + 1).padStart(4, "0")}`
}

/**
 * Generate the invoice for a completed appointment. The appointment must carry
 * an approved report with at least one billing code (REQ-REC-05).
 */
export async function generateInvoice(
  appointmentId: string,
): Promise<ActionResult<InvoiceRow>> {
  const outcome = await withTransaction(async (client) => {
    // Resolve the appointment, its status, and the patient's insurance type.
    const appt = await client.query<{
      patient_id: string
      insurance_type: InvoiceRow["insurance_type"]
      status: string
    }>(
      `SELECT a.patient_id, a.status, p.insurance_type
       FROM appointments a JOIN patients p ON p.id = a.patient_id
       WHERE a.id = $1`,
      [appointmentId],
    )
    if (appt.rowCount === 0) return { kind: "not_found" as const }
    const { patient_id, insurance_type, status: apptStatus } = appt.rows[0]

    // Precondition (UC-REC-01): only a completed consultation may be billed.
    if (apptStatus !== "completed") return { kind: "not_completed" as const }

    // Never bill the same appointment twice (a real invoice already exists,
    // ignoring storno reversals).
    const existing = await client.query(
      `SELECT 1 FROM invoices WHERE appointment_id = $1 AND status <> 'storno' LIMIT 1`,
      [appointmentId],
    )
    if (existing.rowCount && existing.rowCount > 0) return { kind: "duplicate" as const }

    // Collect the billing codes attached to this appointment's report(s).
    const codes = await client.query<BillingCodeAmount>(
      `SELECT rbc.catalog, rbc.multiplier, goae.base_cents, goae.default_multiplier
       FROM report_billing_codes rbc
       JOIN medical_reports mr ON mr.id = rbc.report_id
       LEFT JOIN goae_catalog goae ON rbc.catalog = 'GOAE' AND goae.code = rbc.code
       WHERE mr.appointment_id = $1`,
      [appointmentId],
    )
    if (codes.rowCount === 0) return { kind: "no_codes" as const }

    // Legal catalog match: statutory (GKV) is billed via EBM, private and
    // self-pay (PKV/Selbstzahler) via GOÄ. A mismatch must not be invoiced.
    const isPublic = insurance_type === "gkv"
    const expected = isPublic ? "EBM" : "GOAE"
    if (codes.rows.some((c) => c.catalog !== expected)) {
      return { kind: "wrong_catalog" as const, expected }
    }

    // GKV: validate codes only, no monetary total, queue for the KV batch.
    // PKV/Selbstzahler: sum GOÄ base × Steigerungssatz to a cents total.
    let totalCents: number | null = null
    let status: InvoiceRow["status"] = "ready_for_kv"
    let dueDate: string | null = null

    if (!isPublic) {
      totalCents = codes.rows.reduce((sum, c) => {
        if (c.base_cents == null) return sum
        const factor = c.multiplier ?? c.default_multiplier ?? 1
        return sum + Math.round(c.base_cents * factor)
      }, 0)
      status = "pending_payment"
      const due = new Date()
      due.setDate(due.getDate() + PAYMENT_TERM_DAYS)
      dueDate = due.toISOString().slice(0, 10)
    }

    const invoiceNumber = await allocateInvoiceNumber(client)
    const inserted = await client.query<InvoiceRow>(
      `INSERT INTO invoices
         (invoice_number, appointment_id, patient_id, insurance_type,
          total_cents, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [invoiceNumber, appointmentId, patient_id, insurance_type, totalCents, status, dueDate],
    )
    return { kind: "ok" as const, invoice: inserted.rows[0] }
  })

  switch (outcome.kind) {
    case "not_found": return fail("Appointment not found.")
    case "not_completed": return fail("Only completed consultations can be billed.")
    case "duplicate": return fail("This appointment has already been invoiced.")
    case "no_codes": return fail("Cannot process billing. Please request codes from the treating Doctor.")
    case "wrong_catalog":
      return fail(
        outcome.expected === "EBM"
          ? "Statutory (GKV) patients must be billed with EBM codes, not GOÄ."
          : "Private/self-pay patients must be billed with GOÄ codes, not EBM.",
      )
  }
  revalidatePath("/receptionist/billing")
  revalidatePath("/receptionist")
  return ok(outcome.invoice)
}

/** Mark a private/self-pay invoice as sent to the patient. */
export async function markInvoiceSent(id: string): Promise<ActionResult<InvoiceRow>> {
  const r = await query<InvoiceRow>(
    `UPDATE invoices SET status = 'sent'
     WHERE id = $1 AND status = 'pending_payment' RETURNING *`,
    [id],
  )
  if (r.rowCount === 0) return fail("Invoice not found or not in a sendable state.")
  revalidatePath("/receptionist")
  return ok(r.rows[0])
}

/** Record payment of an invoice. */
export async function markInvoicePaid(id: string): Promise<ActionResult<InvoiceRow>> {
  const r = await query<InvoiceRow>(
    `UPDATE invoices SET status = 'paid'
     WHERE id = $1 AND status IN ('sent', 'pending_payment') RETURNING *`,
    [id],
  )
  if (r.rowCount === 0) return fail("Invoice not found or cannot be marked paid.")
  revalidatePath("/receptionist")
  return ok(r.rows[0])
}

/**
 * Issue a cancellation (storno) invoice for an existing invoice (BR-03-03).
 * The original is preserved for the audit trail; a new, separately numbered
 * invoice reverses the amount and links back via `storno_of`.
 */
export async function stornoInvoice(originalId: string): Promise<ActionResult<InvoiceRow>> {
  const outcome = await withTransaction(async (client) => {
    const orig = await client.query<InvoiceRow>(`SELECT * FROM invoices WHERE id = $1`, [originalId])
    if (orig.rowCount === 0) return { kind: "not_found" as const }
    const original = orig.rows[0]
    if (original.status === "storno") return { kind: "already" as const }

    const invoiceNumber = await allocateInvoiceNumber(client)
    const reversed = original.total_cents == null ? null : -original.total_cents
    const inserted = await client.query<InvoiceRow>(
      `INSERT INTO invoices
         (invoice_number, appointment_id, patient_id, insurance_type,
          total_cents, status, storno_of)
       VALUES ($1, $2, $3, $4, $5, 'storno', $6)
       RETURNING *`,
      [invoiceNumber, original.appointment_id, original.patient_id,
       original.insurance_type, reversed, originalId],
    )
    return { kind: "ok" as const, invoice: inserted.rows[0] }
  })

  if (outcome.kind === "not_found") return fail("Invoice not found.")
  if (outcome.kind === "already") return fail("This invoice has already been cancelled.")
  revalidatePath("/receptionist")
  return ok(outcome.invoice)
}
