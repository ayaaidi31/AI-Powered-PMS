import { describe, it, expect } from "vitest"
import { doctorAvailableOn } from "@/lib/rules"

/**
 * Doctor absence-window logic (Feature 8 override feeding Feature 2 booking):
 * a fixed-term absence blocks bookings inside the window but frees the doctor
 * again afterwards; open-ended leave blocks every future date.
 */
describe("doctorAvailableOn", () => {
  const onDuty = { isAvailable: true, unavailableFrom: null, unavailableUntil: null }
  const bounded = { isAvailable: false, unavailableFrom: "2026-07-10", unavailableUntil: "2026-07-15" }
  const openEnded = { isAvailable: false, unavailableFrom: "2026-07-10", unavailableUntil: null }

  it("an on-duty doctor is available on any date", () => {
    expect(doctorAvailableOn(onDuty, "2026-07-12T09:00:00")).toBe(true)
    expect(doctorAvailableOn(onDuty, "2030-01-01T09:00:00")).toBe(true)
  })

  it("blocks dates inside a fixed-term absence window", () => {
    expect(doctorAvailableOn(bounded, "2026-07-12T09:00:00")).toBe(false) // mid-window
    expect(doctorAvailableOn(bounded, "2026-07-10T09:00:00")).toBe(false) // first day (inclusive)
    expect(doctorAvailableOn(bounded, "2026-07-15T09:00:00")).toBe(false) // last day (inclusive)
  })

  it("allows dates after the absence window ends — the key requirement", () => {
    expect(doctorAvailableOn(bounded, "2026-07-16T09:00:00")).toBe(true)
    expect(doctorAvailableOn(bounded, "2026-08-01T09:00:00")).toBe(true)
  })

  it("allows dates before the absence window opens", () => {
    expect(doctorAvailableOn(bounded, "2026-07-09T09:00:00")).toBe(true)
  })

  it("open-ended leave blocks every date from the start onward", () => {
    expect(doctorAvailableOn(openEnded, "2026-07-10T09:00:00")).toBe(false)
    expect(doctorAvailableOn(openEnded, "2027-01-01T09:00:00")).toBe(false)
    expect(doctorAvailableOn(openEnded, "2026-07-09T09:00:00")).toBe(true) // before it starts
  })

  it("off duty with no window at all is unavailable", () => {
    expect(doctorAvailableOn({ isAvailable: false, unavailableFrom: null, unavailableUntil: null }, "2026-07-12T09:00:00")).toBe(false)
  })
})
