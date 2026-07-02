/**
 * Pure recovery-plan optimizer (Feature 18). Dependency-free so it can be
 * unit-tested: given a sick doctor's affected appointments, available colleagues
 * and their existing commitments, it assigns each appointment to a same-specialty
 * colleague who is free and under capacity (urgency-prioritized, load-balanced),
 * or marks it for cancellation. The DB/AI wiring lives in lib/actions/staffing.ts.
 */
export type UrgencyLevel = "high" | "medium" | "routine"

export interface AffectedAppt {
  id: string
  patientName: string
  startsAt: string
  durationMin: number
  urgency: UrgencyLevel
}
export interface PlanCandidate {
  id: string
  name: string
  specialization: string | null
  capacity: number
}
export interface ExistingAppt { doctorId: string; startsAt: string; durationMin: number }

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

const endOf = (startsAt: string, durationMin: number) => Date.parse(startsAt) + durationMin * 60_000
const overlaps = (aStart: string, aDur: number, bStart: string, bDur: number) =>
  Date.parse(aStart) < endOf(bStart, bDur) && Date.parse(bStart) < endOf(aStart, aDur)
const dayKey = (iso: string) => new Date(iso).toDateString()
const rankOf = (u: UrgencyLevel) => (u === "high" ? 0 : u === "medium" ? 1 : 2)

export function buildRecoveryPlan(input: {
  affected: AffectedAppt[]
  candidates: PlanCandidate[]
  sickSpecialization: string | null
  existing: ExistingAppt[]
  /** new Date().toDateString() of "today" — for the remaining-capacity display. */
  todayKey: string
}): { items: RecoveryItem[]; candidates: RecoveryCandidate[] } {
  const { candidates, sickSpecialization, existing, todayKey } = input

  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase()
  const sickSpecialty = norm(sickSpecialization)
  const isSameSpecialty = (d: { specialization: string | null }) => norm(d.specialization) === sickSpecialty

  // Candidate commitments — mutated during assignment to avoid double-booking / over-filling.
  const load = new Map<string, { busy: { startsAt: string; dur: number }[]; perDay: Map<string, number> }>()
  for (const d of candidates) load.set(d.id, { busy: [], perDay: new Map() })
  for (const a of existing) {
    const l = load.get(a.doctorId)
    if (!l) continue
    l.busy.push({ startsAt: a.startsAt, dur: a.durationMin })
    l.perDay.set(dayKey(a.startsAt), (l.perDay.get(dayKey(a.startsAt)) ?? 0) + 1)
  }

  const capOf = new Map(candidates.map((d) => [d.id, d.capacity]))
  const initialTodayLoad = new Map(candidates.map((d) => [d.id, load.get(d.id)!.perDay.get(todayKey) ?? 0]))

  // Most-urgent first; ties broken by time.
  const affected = [...input.affected].sort((a, b) => rankOf(a.urgency) - rankOf(b.urgency) || Date.parse(a.startsAt) - Date.parse(b.startsAt))

  const items: RecoveryItem[] = affected.map((a) => {
    const dk = dayKey(a.startsAt)
    const eligible = candidates.filter((d) => {
      if (!isSameSpecialty(d)) return false
      const l = load.get(d.id)!
      if ((l.perDay.get(dk) ?? 0) >= (capOf.get(d.id) ?? 0)) return false
      return !l.busy.some((b) => overlaps(a.startsAt, a.durationMin, b.startsAt, b.dur))
    })
    eligible.sort((x, y) => (load.get(x.id)!.perDay.get(dk) ?? 0) - (load.get(y.id)!.perDay.get(dk) ?? 0))
    const target = eligible[0]

    if (target) {
      const l = load.get(target.id)!
      l.busy.push({ startsAt: a.startsAt, dur: a.durationMin })
      l.perDay.set(dk, (l.perDay.get(dk) ?? 0) + 1)
      return { appointmentId: a.id, patientName: a.patientName, startsAt: a.startsAt, durationMin: a.durationMin, urgency: a.urgency, action: "reassign", targetDoctorId: target.id, targetDoctorName: target.name }
    }
    return { appointmentId: a.id, patientName: a.patientName, startsAt: a.startsAt, durationMin: a.durationMin, urgency: a.urgency, action: "cancel", targetDoctorId: null, targetDoctorName: null }
  })

  const candidateInfo: RecoveryCandidate[] = candidates
    .map((d) => ({
      id: d.id,
      name: d.name,
      specialization: d.specialization,
      sameSpecialty: isSameSpecialty(d),
      remainingToday: Math.max(0, (capOf.get(d.id) ?? 0) - (initialTodayLoad.get(d.id) ?? 0)),
    }))
    .sort((a, b) => Number(b.sameSpecialty) - Number(a.sameSpecialty) || b.remainingToday - a.remainingToday)

  return { items, candidates: candidateInfo }
}
