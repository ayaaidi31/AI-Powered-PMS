"use server"

/**
 * Appointment scheduling and lifecycle management.
 *
 * Covers:
 *  - Feature 4  (Web Appointment Scheduling, UC-PAT-02) — booking with
 *    concurrency control to prevent double-booking (REQ-SCHED-03/04).
 *  - Feature 6  (Appointment Modification & Cancellation, UC-PAT-03) —
 *    patient-initiated reschedule/cancel with the 24-hour cut-off (REQ-MOD-05).
 *  - Feature 7  (Receptionist Manual Check-in, UC-REC-02) and Feature 5
 *    (Patient Mobile Self Check-in, UC-PAT-01) — status transition to
 *    `waiting`, guarded against duplicate check-ins (REQ-PAT-05).
 *  - Feature 9  (Receptionist Appointment Management, UC-REC-04) — staff
 *    override of any appointment, recording the reason for change (BR-09-02).
 *
 * Booking and rescheduling run inside a transaction that first takes a
 * per-doctor advisory lock, then verifies the requested time range does not
 * overlap an active appointment. This serialises concurrent requests for the
 * same doctor and makes the "slot already taken" race condition impossible.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { query, withTransaction } from "@/lib/db"
import type { AppointmentRow } from "@/lib/seed-data"
import { ok, fail, conflict, type ActionResult } from "./types"

// Appointment states that occupy a slot. Cancelled / no-show free the slot.
const ACTIVE_STATES = ["scheduled", "waiting", "in_progress", "completed"]

const bookingSchema = z.object({
  patient_id: z.string().uuid("A valid patient is required."),
  doctor_id: z.string().uuid("A valid doctor is required."),
  starts_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date/time."),
  duration_min: z.number().int().positive().max(8 * 60).default(30),
  reason: z.string().trim().max(500).optional(),
})

export type BookingInput = z.infer<typeof bookingSchema>

function revalidateSchedules() {
  revalidatePath("/receptionist/schedule")
  revalidatePath("/patient/appointments")
  revalidatePath("/doctor")
}

/**
 * Book a new appointment.
 *
 * The overlap check and the insert share one transaction so no other booking
 * can slip in between them. If the doctor is already occupied for any part of
 * the requested window, a `conflict` is returned and nothing is written
 * (UC-PAT-02 alternate flow / REQ-SCHED-03).
 */
export async function bookAppointment(
  input: BookingInput,
): Promise<ActionResult<AppointmentRow>> {
  const parsed = bookingSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return fail("Please correct the highlighted fields.", fieldErrors)
  }
  const { patient_id, doctor_id, starts_at, duration_min, reason } = parsed.data

  const result = await withTransaction(async (client) => {
    // Serialise concurrent bookings for this doctor (released at COMMIT/ROLLBACK).
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [doctor_id])

    const clash = await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1
         AND status = ANY($2)
         AND tstzrange(starts_at, starts_at + (duration_min || ' minutes')::interval)
             && tstzrange($3::timestamptz, $3::timestamptz + ($4 || ' minutes')::interval)
       LIMIT 1`,
      [doctor_id, ACTIVE_STATES, starts_at, duration_min],
    )
    if (clash.rowCount && clash.rowCount > 0) return null // slot taken

    const inserted = await client.query<AppointmentRow>(
      `INSERT INTO appointments (patient_id, doctor_id, starts_at, duration_min, status, reason)
       VALUES ($1, $2, $3::timestamptz, $4, 'scheduled', $5)
       RETURNING *`,
      [patient_id, doctor_id, starts_at, duration_min, reason ?? null],
    )
    return inserted.rows[0]
  })

  if (result === null) {
    return conflict("This time slot was just booked by someone else. Please choose another time.")
  }
  revalidateSchedules()
  return ok(result)
}

/**
 * Reschedule an existing appointment to a new time, re-running the same
 * availability guard (excluding the appointment itself). A reason for the
 * change is recorded for the audit trail when the change is staff-initiated
 * (BR-09-02 / REQ-REC-16).
 */
export async function rescheduleAppointment(
  appointmentId: string,
  newStartsAt: string,
  options: { durationMin?: number; reasonForChange?: string } = {},
): Promise<ActionResult<AppointmentRow>> {
  if (Number.isNaN(Date.parse(newStartsAt))) return fail("Invalid date/time.")

  const result = await withTransaction(async (client) => {
    const current = await client.query<AppointmentRow>(
      `SELECT * FROM appointments WHERE id = $1`,
      [appointmentId],
    )
    if (current.rowCount === 0) return "not_found" as const
    const appt = current.rows[0]
    const duration = options.durationMin ?? appt.duration_min

    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [appt.doctor_id])

    const clash = await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1
         AND id <> $2
         AND status = ANY($3)
         AND tstzrange(starts_at, starts_at + (duration_min || ' minutes')::interval)
             && tstzrange($4::timestamptz, $4::timestamptz + ($5 || ' minutes')::interval)
       LIMIT 1`,
      [appt.doctor_id, appointmentId, ACTIVE_STATES, newStartsAt, duration],
    )
    if (clash.rowCount && clash.rowCount > 0) return "conflict" as const

    const updated = await client.query<AppointmentRow>(
      `UPDATE appointments
       SET starts_at = $2::timestamptz, duration_min = $3, status = 'scheduled',
           reason_for_change = COALESCE($4, reason_for_change)
       WHERE id = $1
       RETURNING *`,
      [appointmentId, newStartsAt, duration, options.reasonForChange ?? null],
    )
    return updated.rows[0]
  })

  if (result === "not_found") return fail("Appointment not found.")
  if (result === "conflict") {
    return conflict("The chosen time is no longer available. Please select another.")
  }
  revalidateSchedules()
  return ok(result)
}

/**
 * Cancel an appointment. Sets the status to `cancelled`, which immediately
 * frees the slot for re-booking (it is excluded from the availability check).
 *
 * When `enforce24hWindow` is true (patient self-service path), cancellation is
 * blocked inside the 24-hour cut-off (REQ-MOD-05); staff cancellations
 * (UC-REC-04) bypass this restriction.
 */
export async function cancelAppointment(
  appointmentId: string,
  options: { reasonForChange?: string; enforce24hWindow?: boolean } = {},
): Promise<ActionResult<AppointmentRow>> {
  const current = await query<AppointmentRow>(
    `SELECT * FROM appointments WHERE id = $1`,
    [appointmentId],
  )
  if (current.rowCount === 0) return fail("Appointment not found.")
  const appt = current.rows[0]

  if (appt.status === "cancelled") return fail("This appointment is already cancelled.")

  // An appointment can only be cancelled while still `scheduled`. Once the
  // patient has checked in (waiting) or progressed further, cancellation is no
  // longer permitted — the visit must be closed via its status instead.
  if (appt.status !== "scheduled") {
    return fail(
      "This appointment can no longer be cancelled — the patient has already checked in.",
    )
  }

  if (options.enforce24hWindow) {
    const hoursUntil = (new Date(appt.starts_at).getTime() - Date.now()) / 3_600_000
    if (hoursUntil < 24) {
      return fail("Appointments within 24 hours must be cancelled by calling the clinic directly.")
    }
  }

  const updated = await query<AppointmentRow>(
    `UPDATE appointments
     SET status = 'cancelled', reason_for_change = COALESCE($2, reason_for_change)
     WHERE id = $1
     RETURNING *`,
    [appointmentId, options.reasonForChange ?? null],
  )
  revalidateSchedules()
  return ok(updated.rows[0])
}

/**
 * Check a patient in on arrival (Feature 5 self check-in / Feature 7 manual
 * check-in). Transitions `scheduled` → `waiting` and timestamps the arrival.
 *
 *  - Restricted to the day of the appointment (REQ-PAT-02) when
 *    `enforceSameDay` is set.
 *  - Idempotent: a second call on an already-`waiting` appointment is a no-op
 *    that reports success (REQ-PAT-05 — no duplicate check-ins).
 */
export async function checkInAppointment(
  appointmentId: string,
  options: { enforceSameDay?: boolean } = {},
): Promise<ActionResult<AppointmentRow>> {
  const current = await query<AppointmentRow>(
    `SELECT * FROM appointments WHERE id = $1`,
    [appointmentId],
  )
  if (current.rowCount === 0) return fail("Appointment not found.")
  const appt = current.rows[0]

  if (appt.status === "waiting") return ok(appt) // already checked in

  if (appt.status !== "scheduled") {
    return fail(`Cannot check in an appointment with status "${appt.status}".`)
  }

  if (options.enforceSameDay) {
    const apptDay = new Date(appt.starts_at).toDateString()
    if (apptDay !== new Date().toDateString()) {
      return fail("Check-in is only available on the day of your appointment.")
    }
  }

  const updated = await query<AppointmentRow>(
    `UPDATE appointments SET status = 'waiting', check_in_at = now()
     WHERE id = $1 RETURNING *`,
    [appointmentId],
  )
  revalidateSchedules()
  return ok(updated.rows[0])
}

/**
 * Undo a check-in (REQ-REC-02 reversal): revert a `waiting` appointment back to
 * `scheduled` and clear the check-in time. Only allowed while still `waiting` —
 * once the consultation has started (`in_progress`) it can no longer be undone.
 */
export async function revertCheckIn(appointmentId: string): Promise<ActionResult<AppointmentRow>> {
  const updated = await query<AppointmentRow>(
    `UPDATE appointments SET status = 'scheduled', check_in_at = NULL
     WHERE id = $1 AND status = 'waiting'
     RETURNING *`,
    [appointmentId],
  )
  if (updated.rowCount === 0) {
    return fail("Check-in can only be undone while the patient is still waiting (not yet with the doctor).")
  }
  revalidateSchedules()
  return ok(updated.rows[0])
}

/**
 * General status transition used by the clinical workflow (e.g. the Doctor
 * moving a patient from `waiting` to `in_progress` to `completed`).
 */
export async function setAppointmentStatus(
  appointmentId: string,
  status: AppointmentRow["status"],
): Promise<ActionResult<AppointmentRow>> {
  const updated = await query<AppointmentRow>(
    `UPDATE appointments SET status = $2 WHERE id = $1 RETURNING *`,
    [appointmentId, status],
  )
  if (updated.rowCount === 0) return fail("Appointment not found.")
  revalidateSchedules()
  return ok(updated.rows[0])
}
