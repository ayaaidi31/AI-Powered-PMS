/**
 * Pure business rules behind the CRUD actions — single-sourced and unit-tested,
 * so each requirement's logic is verified independent of the database. The
 * actions perform I/O and delegate the decision to these functions.
 */

type ReportStatus = "draft" | "pending_approval" | "approved"

/** REQ-REC-13: a patient is portal-eligible only with a digital contact channel. */
export const isPortalEligible = (email: string | null, phone: string | null): boolean => Boolean(email || phone)

/** BR-02-06: a finalized (approved) report is immutable; drafts can be edited. */
export const isReportEditable = (status: ReportStatus): boolean => status !== "approved"

/**
 * Report removal mode (German retention law, §630f BGB): an approved report is
 * legally retained → RETRACT (soft); a draft/pending report is not yet a record
 * → HARD delete.
 */
export const reportRemovalMode = (status: ReportStatus): "hard" | "retract" =>
  status === "approved" ? "retract" : "hard"

/** Whether a MISTAKEN appointment may be hard-deleted (otherwise it's cancelled). */
export function appointmentDeletable(input: {
  status: string
  hasReport: boolean
  hasInvoice: boolean
}): { ok: boolean; reason?: string } {
  if (!["scheduled", "cancelled", "no_show"].includes(input.status)) {
    return { ok: false, reason: "This appointment has clinical activity and can't be deleted. Cancel it instead." }
  }
  if (input.hasReport) {
    return { ok: false, reason: "This appointment has a report attached and can't be deleted (legally retained)." }
  }
  if (input.hasInvoice) {
    return { ok: false, reason: "This appointment has an invoice and can't be deleted." }
  }
  return { ok: true }
}

/**
 * Patient self check-in (Feature 5) / receptionist manual check-in (Feature 7).
 *  - "already": a second call on a `waiting` appointment is an idempotent no-op
 *    (REQ-PAT-05 — no duplicate check-ins).
 *  - "blocked": only `scheduled` appointments can be checked in; the self-service
 *    path also restricts it to the appointment day (REQ-PAT-02).
 *  - "ok": transition `scheduled` → `waiting` (REQ-PAT-03 / REQ-REC-07).
 */
export type CheckInDecision = { action: "ok" } | { action: "already" } | { action: "blocked"; reason: string }
export function checkInDecision(input: {
  status: string
  isAppointmentToday: boolean
  enforceSameDay: boolean
}): CheckInDecision {
  if (input.status === "waiting") return { action: "already" }
  if (input.status !== "scheduled") {
    return { action: "blocked", reason: `Cannot check in an appointment with status "${input.status}".` }
  }
  if (input.enforceSameDay && !input.isAppointmentToday) {
    return { action: "blocked", reason: "Check-in is only available on the day of your appointment." }
  }
  return { action: "ok" }
}

/** Undo a check-in only while still `waiting` (not yet with the doctor). */
export const canRevertCheckIn = (status: string): boolean => status === "waiting"

/**
 * Cancellation eligibility. Only `scheduled` appointments can be cancelled; the
 * self-service path also enforces the 24-hour window (REQ-MOD-05).
 */
export function cancellationCheck(
  status: string,
  startsAtMs: number,
  enforce24hWindow: boolean,
  nowMs: number,
): { ok: boolean; reason?: string } {
  if (status === "cancelled") return { ok: false, reason: "This appointment is already cancelled." }
  if (status !== "scheduled") {
    return { ok: false, reason: "This appointment can no longer be cancelled — the patient has already checked in." }
  }
  if (enforce24hWindow && (startsAtMs - nowMs) / 3_600_000 < 24) {
    return { ok: false, reason: "Appointments within 24 hours must be cancelled by calling the clinic directly." }
  }
  return { ok: true }
}
