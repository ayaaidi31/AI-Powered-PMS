import { describe, it, expect } from "vitest"
import { CLINIC_SLOT_TIMES, remainingClinicSlots, nextWorkingDay } from "@/lib/rules"

// Local-time constructor so the tests match the server-clock logic under test.
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo, d, h, mi, 0, 0)

describe("remainingClinicSlots", () => {
  it("returns every slot early on a weekday morning", () => {
    const slots = remainingClinicSlots(at(2026, 6, 15, 7, 0)) // Wed 07:00, before opening
    expect(slots).toEqual([...CLINIC_SLOT_TIMES])
  })

  it("drops slots that have already passed", () => {
    const slots = remainingClinicSlots(at(2026, 6, 15, 14, 15)) // Wed 14:15
    expect(slots[0]).toBe("14:30")
    expect(slots).not.toContain("14:00")
  })

  it("is empty after the last slot has passed (the reported 7pm bug)", () => {
    expect(remainingClinicSlots(at(2026, 6, 15, 19, 0))).toEqual([]) // Wed 19:00
    expect(remainingClinicSlots(at(2026, 6, 15, 16, 31))).toEqual([]) // just after 16:30
  })

  it("keeps the final 16:30 slot right up to the boundary", () => {
    expect(remainingClinicSlots(at(2026, 6, 15, 16, 29))).toContain("16:30")
  })

  it("is empty on weekends", () => {
    expect(remainingClinicSlots(at(2026, 6, 18, 9, 0))).toEqual([]) // Saturday
    expect(remainingClinicSlots(at(2026, 6, 19, 9, 0))).toEqual([]) // Sunday
  })
})

describe("nextWorkingDay", () => {
  it("gives the following weekday", () => {
    expect(nextWorkingDay(at(2026, 6, 15, 19, 0)).getDay()).toBe(4) // Wed → Thu
  })
  it("skips the weekend", () => {
    expect(nextWorkingDay(at(2026, 6, 17, 12, 0)).getDay()).toBe(1) // Fri → Mon
    expect(nextWorkingDay(at(2026, 6, 18, 12, 0)).getDay()).toBe(1) // Sat → Mon
  })
})
