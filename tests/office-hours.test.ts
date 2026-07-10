import { describe, it, expect } from "vitest"
import { officeHoursViolation } from "@/lib/rules"

/**
 * Office-hours guard behind the voice booking assistant (Feature 11): a slot is
 * bookable only on a future weekday between 08:00 and 16:30.
 */
describe("officeHoursViolation", () => {
  // A fixed "now" so the tests are deterministic: Wed 2026-07-01, 08:00 local.
  const now = new Date(2026, 6, 1, 8, 0, 0).getTime()

  it("accepts a valid future weekday slot within hours", () => {
    expect(officeHoursViolation("2026-07-02T10:00:00", now)).toBeNull() // Thu 10:00
    expect(officeHoursViolation("2026-07-02T15:00:00", now)).toBeNull() // Thu 15:00 (3 p.m.)
    expect(officeHoursViolation("2026-07-02T16:30:00", now)).toBeNull() // last start
  })

  it("rejects a slot in the past", () => {
    expect(officeHoursViolation("2026-06-30T10:00:00", now)).toBe("past")
  })

  it("rejects weekends", () => {
    expect(officeHoursViolation("2026-07-04T10:00:00", now)).toBe("weekend") // Saturday
    expect(officeHoursViolation("2026-07-05T10:00:00", now)).toBe("weekend") // Sunday
  })

  it("rejects times outside 08:00–16:30", () => {
    expect(officeHoursViolation("2026-07-02T07:30:00", now)).toBe("closed") // before open
    expect(officeHoursViolation("2026-07-02T17:00:00", now)).toBe("closed") // after last start
  })

  it("rejects an unparseable date", () => {
    expect(officeHoursViolation("not-a-date", now)).toBe("invalid")
  })

  it("rejects a slot that is sooner than the minimum notice", () => {
    // Now = Thu 2026-07-02, 12:28; a 12:30 start is only two minutes away.
    const at1228 = new Date(2026, 6, 2, 12, 28, 0).getTime()
    expect(officeHoursViolation("2026-07-02T12:30:00", at1228, 60)).toBe("too_soon")
    // A slot beyond the notice window on the same day is fine.
    expect(officeHoursViolation("2026-07-02T14:00:00", at1228, 60)).toBeNull()
    // With no minimum notice the two-minute slot is allowed again.
    expect(officeHoursViolation("2026-07-02T12:30:00", at1228)).toBeNull()
  })
})
