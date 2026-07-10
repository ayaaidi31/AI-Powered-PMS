"use server"

/**
 * AI-assisted staff scheduling & conflict resolution (Feature 18). DB/AI wiring
 * around the pure optimizer in lib/recovery-plan.ts: when a doctor is off duty,
 * proposeRecoveryPlan triages their in-window appointments (AI urgency) and
 * builds an optimized, same-specialty recovery plan; the receptionist reviews
 * and executeRecoveryPlan commits it (human-in-the-loop).
 */
import { getAppointments, getDoctors } from "@/lib/queries"
import { doctorName } from "@/lib/display"
import { buildRecoveryPlan, type RecoveryItem, type RecoveryCandidate } from "@/lib/recovery-plan"
import { reassignAppointment, cancelAppointment } from "./appointments"
import { classifyUrgency } from "./ai"
import { requireStaff } from "@/lib/auth/guard"
import { ok, fail, type ActionResult } from "./types"

const ACTIVE = new Set(["scheduled", "waiting", "in_progress"])

export type { RecoveryItem, RecoveryCandidate } from "@/lib/recovery-plan"
export interface RecoveryPlan {
  doctorId: string
  doctorName: string
  doctorSpecialization: string | null
  windowFrom: string | null
  windowUntil: string | null
  items: RecoveryItem[]
  candidates: RecoveryCandidate[]
  reassignCount: number
  cancelCount: number
}

/** Build an optimized recovery plan for an unavailable doctor's appointments. */
export async function proposeRecoveryPlan(doctorId: string): Promise<ActionResult<RecoveryPlan>> {
  const g = await requireStaff()
  if (!g.ok) return g.error
  const [appointments, doctors] = await Promise.all([getAppointments(), getDoctors()])
  const sick = doctors.find((d) => d.id === doctorId)
  if (!sick) return fail("Doctor not found.")

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  // Absence window: only appointments inside it need recovery.
  const windowFrom = sick.unavailable_from ?? null
  const windowUntil = sick.unavailable_until ?? null
  const fromMs = windowFrom ? Date.parse(`${windowFrom}T00:00:00`) : startOfToday.getTime()
  const untilMs = windowUntil ? Date.parse(`${windowUntil}T23:59:59.999`) : Number.POSITIVE_INFINITY

  const affectedAppts = appointments.filter(
    (a) => a.doctor_id === doctorId && a.status === "scheduled" &&
      Date.parse(a.starts_at) >= fromMs && Date.parse(a.starts_at) <= untilMs,
  )

  // AI triage of each appointment's urgency (the only AI step; assignment is pure).
  const urgency = await classifyUrgency(affectedAppts.map((a) => ({ id: a.id, reason: a.reason })))

  const candidates = doctors
    .filter((d) => d.id !== doctorId && d.is_available)
    .map((d) => ({ id: d.id, name: doctorName(d), specialization: d.specialization, capacity: d.max_daily_capacity ?? 20 }))
  const existing = appointments
    .filter((a) => ACTIVE.has(a.status))
    .map((a) => ({ doctorId: a.doctor_id, startsAt: a.starts_at, durationMin: a.duration_min }))

  const { items, candidates: candidateInfo } = buildRecoveryPlan({
    affected: affectedAppts.map((a) => ({
      id: a.id,
      patientName: a.patient_name,
      startsAt: a.starts_at,
      durationMin: a.duration_min,
      urgency: urgency[a.id] ?? "medium",
    })),
    candidates,
    sickSpecialization: sick.specialization,
    existing,
    todayKey: startOfToday.toDateString(),
  })

  return ok({
    doctorId,
    doctorName: doctorName(sick),
    doctorSpecialization: sick.specialization,
    windowFrom,
    windowUntil,
    items,
    candidates: candidateInfo,
    reassignCount: items.filter((i) => i.action === "reassign").length,
    cancelCount: items.filter((i) => i.action === "cancel").length,
  })
}

/** Apply the receptionist-approved recovery plan. */
export async function executeRecoveryPlan(
  items: { appointmentId: string; action: "reassign" | "cancel"; targetDoctorId: string | null }[],
): Promise<ActionResult<{ reassigned: number; cancelled: number; failed: number }>> {
  const g = await requireStaff()
  if (!g.ok) return g.error
  let reassigned = 0, cancelled = 0, failed = 0
  for (const it of items) {
    if (it.action === "reassign" && it.targetDoctorId) {
      const r = await reassignAppointment(it.appointmentId, it.targetDoctorId, { reasonForChange: "Reassigned — treating doctor unavailable" })
      r.status === "ok" ? reassigned++ : failed++
    } else if (it.action === "cancel") {
      const r = await cancelAppointment(it.appointmentId, { reasonForChange: "Cancelled — treating doctor unavailable" })
      r.status === "ok" ? cancelled++ : failed++
    }
  }
  if (failed > 0 && reassigned === 0 && cancelled === 0) return fail("Could not apply the recovery plan.")
  return ok({ reassigned, cancelled, failed })
}
