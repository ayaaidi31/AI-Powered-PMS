"use server"

/**
 * AI-assisted staff scheduling & conflict resolution (Feature 18).
 *
 * When a doctor goes unavailable (sick leave), proposeRecoveryPlan computes an
 * optimized recovery plan for their upcoming appointments: reassign each to an
 * available colleague who is free at that time and under their daily capacity
 * (balancing load), or cancel when no coverage exists. The receptionist reviews
 * and edits the plan, then executeRecoveryPlan commits it (human-in-the-loop,
 * REQ-SCHED-04). Deterministic constraint logic — no hallucination.
 */
import { getAppointments, getDoctors } from "@/lib/queries"
import { doctorName } from "@/lib/display"
import { reassignAppointment, cancelAppointment } from "./appointments"
import { classifyUrgency, type UrgencyLevel } from "./ai"
import { ok, fail, type ActionResult } from "./types"

const ACTIVE = new Set(["scheduled", "waiting", "in_progress"])

export interface RecoveryItem {
  appointmentId: string
  patientName: string
  startsAt: string
  durationMin: number
  urgency: UrgencyLevel
  action: "reassign" | "cancel"
  targetDoctorId: string | null
  targetDoctorName: string | null
}
export interface RecoveryCandidate {
  id: string
  name: string
  specialization: string | null
  sameSpecialty: boolean
  remainingToday: number
}
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

const endOf = (startsAt: string, durationMin: number) => Date.parse(startsAt) + durationMin * 60_000
const overlaps = (aStart: string, aDur: number, bStart: string, bDur: number) =>
  Date.parse(aStart) < endOf(bStart, bDur) && Date.parse(bStart) < endOf(aStart, aDur)
const dayKey = (iso: string) => new Date(iso).toDateString()

/** Build an optimized recovery plan for an unavailable doctor's appointments. */
export async function proposeRecoveryPlan(doctorId: string): Promise<ActionResult<RecoveryPlan>> {
  const [appointments, doctors] = await Promise.all([getAppointments(), getDoctors()])
  const sick = doctors.find((d) => d.id === doctorId)
  if (!sick) return fail("Doctor not found.")

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  // Absence window: only appointments INSIDE it need recovery. `from` defaults
  // to today; `until` open-ended (null) means "from `from` onward".
  const windowFrom = sick.unavailable_from ?? null
  const windowUntil = sick.unavailable_until ?? null
  const fromMs = windowFrom ? Date.parse(`${windowFrom}T00:00:00`) : startOfToday.getTime()
  const untilMs = windowUntil ? Date.parse(`${windowUntil}T23:59:59.999`) : Number.POSITIVE_INFINITY

  // The sick doctor's scheduled appointments within the absence window.
  const affected = appointments.filter(
    (a) => a.doctor_id === doctorId && a.status === "scheduled" &&
      Date.parse(a.starts_at) >= fromMs && Date.parse(a.starts_at) <= untilMs,
  )

  // AI triage, then process MOST URGENT first so scarce same-specialty slots go
  // to the patients who need them most (routine overflow is cancelled).
  const urgency = await classifyUrgency(affected.map((a) => ({ id: a.id, reason: a.reason })))
  const rankOf = (u: UrgencyLevel) => (u === "high" ? 0 : u === "medium" ? 1 : 2)
  affected.sort((a, b) =>
    rankOf(urgency[a.id] ?? "medium") - rankOf(urgency[b.id] ?? "medium") ||
    Date.parse(a.starts_at) - Date.parse(b.starts_at),
  )

  // Only colleagues of the SAME specialty may take over (a cardiologist can't
  // cover dermatology). Availability + capacity + free slot are checked too.
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase()
  const sickSpecialty = norm(sick.specialization)
  const isSameSpecialty = (d: { specialization: string | null }) => norm(d.specialization) === sickSpecialty

  const candidates = doctors.filter((d) => d.id !== doctorId && d.is_available)
  const todayKey = startOfToday.toDateString()

  // Each candidate's current commitments (for overlap + daily-capacity checks).
  // Mutated as we assign, so the plan never double-books or over-fills a day.
  const load = new Map<string, { busy: { startsAt: string; dur: number }[]; perDay: Map<string, number> }>()
  for (const d of candidates) load.set(d.id, { busy: [], perDay: new Map() })
  for (const a of appointments) {
    if (!ACTIVE.has(a.status)) continue
    const l = load.get(a.doctor_id)
    if (!l) continue
    l.busy.push({ startsAt: a.starts_at, dur: a.duration_min })
    l.perDay.set(dayKey(a.starts_at), (l.perDay.get(dayKey(a.starts_at)) ?? 0) + 1)
  }

  const capOf = new Map(doctors.map((d) => [d.id, d.max_daily_capacity ?? 20]))
  // Snapshot each candidate's load today BEFORE the plan assigns anything.
  const initialTodayLoad = new Map(candidates.map((d) => [d.id, load.get(d.id)!.perDay.get(todayKey) ?? 0]))

  const items: RecoveryItem[] = affected.map((a) => {
    const dk = dayKey(a.starts_at)
    // Eligible colleagues: SAME specialty, free at this slot, under capacity.
    const eligible = candidates.filter((d) => {
      if (!isSameSpecialty(d)) return false
      const l = load.get(d.id)!
      if ((l.perDay.get(dk) ?? 0) >= (capOf.get(d.id) ?? 20)) return false
      return !l.busy.some((b) => overlaps(a.starts_at, a.duration_min, b.startsAt, b.dur))
    })
    // Prefer the least-loaded colleague that day (balance the workload).
    eligible.sort((x, y) => (load.get(x.id)!.perDay.get(dk) ?? 0) - (load.get(y.id)!.perDay.get(dk) ?? 0))
    const target = eligible[0]

    if (target) {
      const l = load.get(target.id)!
      l.busy.push({ startsAt: a.starts_at, dur: a.duration_min })
      l.perDay.set(dk, (l.perDay.get(dk) ?? 0) + 1)
      return {
        appointmentId: a.id,
        patientName: a.patient_name,
        startsAt: a.starts_at,
        durationMin: a.duration_min,
        urgency: urgency[a.id] ?? "medium",
        action: "reassign",
        targetDoctorId: target.id,
        targetDoctorName: doctorName(target),
      }
    }
    return {
      appointmentId: a.id,
      patientName: a.patient_name,
      startsAt: a.starts_at,
      durationMin: a.duration_min,
      urgency: urgency[a.id] ?? "medium",
      action: "cancel",
      targetDoctorId: null,
      targetDoctorName: null,
    }
  })

  // Candidate roster for manual override: same-specialty first, with remaining
  // capacity today. Reception can still override to any available colleague.
  const candidateInfo: RecoveryCandidate[] = candidates
    .map((d) => ({
      id: d.id,
      name: doctorName(d),
      specialization: d.specialization,
      sameSpecialty: isSameSpecialty(d),
      remainingToday: Math.max(0, (capOf.get(d.id) ?? 20) - (initialTodayLoad.get(d.id) ?? 0)),
    }))
    .sort((a, b) => Number(b.sameSpecialty) - Number(a.sameSpecialty) || b.remainingToday - a.remainingToday)

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
