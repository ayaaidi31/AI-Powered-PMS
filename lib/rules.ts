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
 * Patient self check-in (Feature 3) / receptionist manual check-in (Feature 6).
 *  - "already": a second call on a `waiting` appointment is an idempotent no-op
 *    (REQ-PAT-05 — no duplicate check-ins).
 *  - "blocked": only `scheduled` appointments can be checked in; the self-service
 *    path also restricts it to the appointment day (REQ-PAT-02).
 *  - "ok": transition `scheduled` → `waiting` (REQ-PAT-03 / REQ-REC-07).
 */
export type CheckInDecision = { action: "ok" } | { action: "already" } | { action: "blocked"; reason: string }
/** Minutes before the appointment when self check-in opens. */
export const CHECKIN_WINDOW_MIN = 15
export function checkInDecision(input: {
  status: string
  isAppointmentToday: boolean
  enforceSameDay: boolean
  /** Epoch ms of the appointment start and "now" — enable the early-window gate. */
  startsAtMs?: number
  nowMs?: number
  earlyWindowMin?: number
}): CheckInDecision {
  if (input.status === "waiting") return { action: "already" }
  if (input.status !== "scheduled") {
    return { action: "blocked", reason: `Cannot check in an appointment with status "${input.status}".` }
  }
  // Self-service path only: same-day + opens a short window before the start, so a
  // patient can't check in hours early (they must actually be arriving).
  if (input.enforceSameDay) {
    if (!input.isAppointmentToday) {
      return { action: "blocked", reason: "Check-in is only available on the day of your appointment." }
    }
    if (input.startsAtMs != null && input.nowMs != null) {
      const windowMin = input.earlyWindowMin ?? CHECKIN_WINDOW_MIN
      const opensAt = input.startsAtMs - windowMin * 60_000
      if (input.nowMs < opensAt) {
        const mins = Math.ceil((opensAt - input.nowMs) / 60_000)
        return {
          action: "blocked",
          reason: `Check-in opens ${windowMin} minutes before your appointment — please try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
        }
      }
    }
  }
  return { action: "ok" }
}

/** Undo a check-in only while still `waiting` (not yet with the doctor). */
export const canRevertCheckIn = (status: string): boolean => status === "waiting"

/** Normalize any date-parseable value to a comparable `YYYY-MM-DD` key. */
function dayKey(value: string): string | null {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Whether a doctor can see patients on a given calendar date, honouring an
 * absence window (Feature 8 override → Feature 2 booking).
 *  - On duty → always available.
 *  - Off duty with a fixed return date → unavailable only within
 *    [unavailableFrom, unavailableUntil]; bookable again after it ends.
 *  - Off duty open-ended (no return date) → unavailable for every future date.
 */
export function doctorAvailableOn(
  doc: { isAvailable: boolean; unavailableFrom?: string | null; unavailableUntil?: string | null },
  dateISO: string,
): boolean {
  if (doc.isAvailable) return true
  const day = dayKey(dateISO)
  if (!day) return false
  const from = doc.unavailableFrom ? dayKey(doc.unavailableFrom) : null
  const until = doc.unavailableUntil ? dayKey(doc.unavailableUntil) : null
  // Open-ended leave: unavailable from the start date onward (all future dates).
  if (!until) return from ? day < from : false
  // Bounded leave: free before the window opens or after it closes.
  if (from && day < from) return true
  return day > until
}

/**
 * Minimum notice for a self-service booking. A patient cannot grab a slot that
 * starts within the next hour: there must be enough lead time to travel in and
 * for the front desk to prepare, so an appointment two minutes away is refused.
 */
export const MIN_BOOKING_LEAD_MIN = 60

/**
 * Office-hours check for the voice booking assistant (Feature 11). Returns the
 * reason a requested slot is not bookable, or null when it is fine. Hours are
 * Monday–Friday, 08:00–16:30 (last 30-minute start). `minLeadMin` enforces a
 * minimum notice before the start (0 disables it).
 */
export type OfficeHoursViolation = "invalid" | "past" | "too_soon" | "weekend" | "closed"
export function officeHoursViolation(dateISO: string, nowMs: number, minLeadMin = 0): OfficeHoursViolation | null {
  const d = new Date(dateISO)
  if (Number.isNaN(d.getTime())) return "invalid"
  const startMs = d.getTime()
  if (startMs < nowMs) return "past"
  if (minLeadMin > 0 && startMs < nowMs + minLeadMin * 60_000) return "too_soon"
  const weekday = d.getDay() // 0 Sun … 6 Sat
  if (weekday === 0 || weekday === 6) return "weekend"
  const minutes = d.getHours() * 60 + d.getMinutes()
  if (minutes < 8 * 60 || minutes > 16 * 60 + 30) return "closed"
  return null
}

/** Bookable 30-minute start times within office hours (last start 16:30). */
export const CLINIC_SLOT_TIMES = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
] as const

const isWeekendDate = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6

/**
 * Start times still bookable on `now`'s date — used to keep the voice assistant
 * from proposing slots that have already passed. Empty on weekends or once the
 * day's last slot is gone.
 */
export function remainingClinicSlots(now: Date, minLeadMin = 0): string[] {
  if (isWeekendDate(now)) return []
  const earliest = now.getTime() + minLeadMin * 60_000
  return CLINIC_SLOT_TIMES.filter((s) => {
    const [h, m] = s.split(":").map(Number)
    const at = new Date(now)
    at.setHours(h, m, 0, 0)
    return at.getTime() >= earliest
  })
}

/** The next Monday–Friday date strictly after `now`. */
export function nextWorkingDay(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  do { d.setDate(d.getDate() + 1) } while (isWeekendDate(d))
  return d
}

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

/**
 * Reschedule eligibility. A reschedule is a cancel + re-book of the same visit,
 * so the self-service path enforces the SAME 24-hour window as cancellation
 * (REQ-MOD-05) — judged against how soon the CURRENT appointment is. This stops
 * a within-24h appointment being moved out and then cancelled to dodge the
 * cut-off. Staff-initiated changes pass `enforce24hWindow = false` to override.
 */
export function rescheduleCheck(
  status: string,
  startsAtMs: number,
  enforce24hWindow: boolean,
  nowMs: number,
): { ok: boolean; reason?: string } {
  if (status !== "scheduled") {
    return { ok: false, reason: "This appointment can no longer be rescheduled." }
  }
  if (enforce24hWindow && (startsAtMs - nowMs) / 3_600_000 < 24) {
    return { ok: false, reason: "Appointments within 24 hours must be rescheduled by calling the clinic directly." }
  }
  return { ok: true }
}
