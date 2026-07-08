import { describe, it, expect } from "vitest"
import { rescheduleCheck, checkInDecision, CHECKIN_WINDOW_MIN } from "@/lib/rules"

const NOW = Date.UTC(2026, 0, 15, 10, 0, 0) // fixed "now"
const minutes = (n: number) => NOW + n * 60_000
const hours = (n: number) => NOW + n * 3_600_000

describe("rescheduleCheck (same 24h rule as cancel)", () => {
  it("blocks a non-scheduled appointment", () => {
    expect(rescheduleCheck("completed", hours(48), true, NOW).ok).toBe(false)
    expect(rescheduleCheck("cancelled", hours(48), true, NOW).ok).toBe(false)
  })

  it("blocks self-service reschedule inside 24 hours", () => {
    const r = rescheduleCheck("scheduled", hours(2), true, NOW)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/24 hours/i)
  })

  it("allows self-service reschedule more than 24 hours out", () => {
    expect(rescheduleCheck("scheduled", hours(48), true, NOW).ok).toBe(true)
  })

  it("allows staff reschedule inside 24 hours (window not enforced)", () => {
    expect(rescheduleCheck("scheduled", hours(2), false, NOW).ok).toBe(true)
  })
})

describe("checkInDecision (15-minute self-service window)", () => {
  it("exposes the window constant", () => {
    expect(CHECKIN_WINDOW_MIN).toBe(15)
  })

  it("is idempotent for an already-waiting appointment", () => {
    expect(checkInDecision({ status: "waiting", isAppointmentToday: true, enforceSameDay: true }).action).toBe("already")
  })

  it("blocks a non-scheduled appointment", () => {
    expect(checkInDecision({ status: "completed", isAppointmentToday: true, enforceSameDay: true }).action).toBe("blocked")
  })

  it("self-service: blocks when not the appointment day", () => {
    expect(checkInDecision({ status: "scheduled", isAppointmentToday: false, enforceSameDay: true }).action).toBe("blocked")
  })

  it("self-service: blocks when more than 15 minutes early", () => {
    const d = checkInDecision({
      status: "scheduled", isAppointmentToday: true, enforceSameDay: true,
      startsAtMs: minutes(60), nowMs: NOW,
    })
    expect(d.action).toBe("blocked")
    if (d.action === "blocked") expect(d.reason).toMatch(/opens 15 minutes/i)
  })

  it("self-service: allows once inside the 15-minute window", () => {
    expect(checkInDecision({
      status: "scheduled", isAppointmentToday: true, enforceSameDay: true,
      startsAtMs: minutes(10), nowMs: NOW,
    }).action).toBe("ok")
  })

  it("staff manual check-in ignores the early window", () => {
    expect(checkInDecision({
      status: "scheduled", isAppointmentToday: true, enforceSameDay: false,
      startsAtMs: hours(5), nowMs: NOW,
    }).action).toBe("ok")
  })

  it("skips the window gate when times are not supplied", () => {
    expect(checkInDecision({ status: "scheduled", isAppointmentToday: true, enforceSameDay: true }).action).toBe("ok")
  })
})
