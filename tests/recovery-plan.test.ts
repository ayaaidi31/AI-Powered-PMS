import { describe, it, expect } from "vitest"
import { buildRecoveryPlan, type AffectedAppt, type PlanCandidate, type ExistingAppt, type UrgencyLevel } from "@/lib/recovery-plan"

const day = "2026-06-18"
const at = (hhmm: string) => `${day}T${hhmm}:00.000Z`
const todayKey = new Date(at("09:00")).toDateString()

const appt = (id: string, hhmm: string, urgency: UrgencyLevel = "medium", durationMin = 30): AffectedAppt => ({
  id, patientName: `P-${id}`, startsAt: at(hhmm), durationMin, urgency,
})
const cand = (id: string, specialization: string | null, capacity: number): PlanCandidate => ({ id, name: `Dr ${id}`, specialization, capacity })
const busy = (doctorId: string, hhmm: string, durationMin = 30): ExistingAppt => ({ doctorId, startsAt: at(hhmm), durationMin })

const run = (o: { affected: AffectedAppt[]; candidates: PlanCandidate[]; sick: string | null; existing?: ExistingAppt[] }) =>
  buildRecoveryPlan({ affected: o.affected, candidates: o.candidates, sickSpecialization: o.sick, existing: o.existing ?? [], todayKey })

describe("buildRecoveryPlan — specialty matching", () => {
  it("reassigns only to a same-specialty colleague", () => {
    const { items } = run({
      affected: [appt("a", "09:00")],
      candidates: [cand("CARD", "Cardiology", 5), cand("DERM", "Dermatology", 5)],
      sick: "Cardiology",
    })
    expect(items[0].action).toBe("reassign")
    expect(items[0].targetDoctorId).toBe("CARD")
  })

  it("cancels when no same-specialty colleague exists (no cross-specialty cover)", () => {
    const { items } = run({
      affected: [appt("a", "09:00")],
      candidates: [cand("DERM", "Dermatology", 5)],
      sick: "Cardiology",
    })
    expect(items[0].action).toBe("cancel")
    expect(items[0].targetDoctorId).toBeNull()
  })

  it("matches specialty case/space-insensitively", () => {
    const { items } = run({
      affected: [appt("a", "09:00")],
      candidates: [cand("X", "  cardiology ", 5)],
      sick: "Cardiology",
    })
    expect(items[0].action).toBe("reassign")
  })
})

describe("buildRecoveryPlan — capacity & overlap", () => {
  it("does not assign a colleague already at daily capacity", () => {
    const { items } = run({
      affected: [appt("a", "11:00")],
      candidates: [cand("A", "Cardiology", 1)],
      sick: "Cardiology",
      existing: [busy("A", "09:00")], // A already has 1 today, capacity 1
    })
    expect(items[0].action).toBe("cancel")
  })

  it("does not assign a colleague who is busy at that exact time", () => {
    const { items } = run({
      affected: [appt("a", "09:00")],
      candidates: [cand("A", "Cardiology", 5)],
      sick: "Cardiology",
      existing: [busy("A", "09:00")], // overlaps
    })
    expect(items[0].action).toBe("cancel")
  })

  it("assigns when the colleague is free at a non-overlapping time", () => {
    const { items } = run({
      affected: [appt("a", "10:00")],
      candidates: [cand("A", "Cardiology", 5)],
      sick: "Cardiology",
      existing: [busy("A", "09:00")], // different slot
    })
    expect(items[0].action).toBe("reassign")
    expect(items[0].targetDoctorId).toBe("A")
  })

  it("never double-books the same colleague within one plan", () => {
    // Two affected appts at the same time; one colleague, capacity 5.
    const { items } = run({
      affected: [appt("a", "09:00"), appt("b", "09:00")],
      candidates: [cand("A", "Cardiology", 5)],
      sick: "Cardiology",
    })
    const reassigned = items.filter((i) => i.action === "reassign")
    expect(reassigned).toHaveLength(1) // the second can't take the same slot
    expect(items.filter((i) => i.action === "cancel")).toHaveLength(1)
  })
})

describe("buildRecoveryPlan — urgency prioritization", () => {
  it("gives the scarce slot to the more urgent patient (not the earlier one)", () => {
    const { items } = run({
      affected: [appt("routine", "09:00", "routine"), appt("urgent", "10:00", "high")],
      candidates: [cand("A", "Cardiology", 1)], // only one slot
      sick: "Cardiology",
    })
    const urgent = items.find((i) => i.appointmentId === "urgent")!
    const routine = items.find((i) => i.appointmentId === "routine")!
    expect(urgent.action).toBe("reassign")
    expect(routine.action).toBe("cancel")
  })
})

describe("buildRecoveryPlan — load balancing", () => {
  it("prefers the least-loaded same-specialty colleague", () => {
    const { items } = run({
      affected: [appt("a", "11:00")],
      candidates: [cand("BUSY", "Cardiology", 5), cand("FREE", "Cardiology", 5)],
      sick: "Cardiology",
      existing: [busy("BUSY", "08:00"), busy("BUSY", "09:00")], // BUSY has 2 today, FREE has 0
    })
    expect(items[0].targetDoctorId).toBe("FREE")
  })
})

describe("buildRecoveryPlan — candidate roster", () => {
  it("reports remaining daily capacity and sorts same-specialty first", () => {
    const { candidates } = run({
      affected: [],
      candidates: [cand("CARD", "Cardiology", 5), cand("DERM", "Dermatology", 5)],
      sick: "Cardiology",
      existing: [busy("CARD", "08:00"), busy("CARD", "09:00")], // CARD used 2 → remaining 3
    })
    expect(candidates[0].id).toBe("CARD")
    expect(candidates[0].sameSpecialty).toBe(true)
    expect(candidates[0].remainingToday).toBe(3)
    expect(candidates[1].sameSpecialty).toBe(false)
  })

  it("returns no items for an empty affected list", () => {
    const { items } = run({ affected: [], candidates: [cand("A", "Cardiology", 5)], sick: "Cardiology" })
    expect(items).toEqual([])
  })
})
