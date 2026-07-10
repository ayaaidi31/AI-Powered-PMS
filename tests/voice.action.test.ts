import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// The voice module pulls in the appointment actions (and, transitively, the
// server-only auth guard); mock those seams so the conversational brain can be
// tested in isolation. The language model and the database reads are stubbed per
// test to drive specific situations.
vi.mock("server-only", () => ({}))

const mistralChat = vi.fn()
vi.mock("@/lib/llm/mistral", () => ({
  mistralChat: (...args: unknown[]) => mistralChat(...args),
  isLlmConfigured: () => true,
}))

const getCurrentPatient = vi.fn()
const getDoctors = vi.fn()
const getAppointments = vi.fn()
const getAppointmentsByPatient = vi.fn()
vi.mock("@/lib/queries", () => ({
  getCurrentPatient: () => getCurrentPatient(),
  getDoctors: () => getDoctors(),
  getAppointments: () => getAppointments(),
  getAppointmentsByPatient: () => getAppointmentsByPatient(),
}))

vi.mock("@/lib/actions/appointments", () => ({
  bookAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
}))

import { voiceAgentReply } from "@/lib/actions/voice"

const PATIENT = { id: "p1", first_name: "Max", last_name: "Mustermann" }
const DOCTOR = { id: "d1", first_name: "Anna", last_name: "Smith", specialization: "General", is_available: true }

// Wednesday 15 July 2026, 14:00 local — the morning slots have already passed.
const NOW = new Date(2026, 6, 15, 14, 0, 0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  getCurrentPatient.mockResolvedValue(PATIENT)
  getDoctors.mockResolvedValue([DOCTOR])
  getAppointments.mockResolvedValue([])
  getAppointmentsByPatient.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("voiceAgentReply time guard", () => {
  it("overrides a booking the model claims is free but is in the past", async () => {
    mistralChat.mockResolvedValue(
      JSON.stringify({
        say: "Dr. Smith is available at 08:00 today. Shall I book it?",
        proposed_datetime: "2026-07-15T08:00",
        action: { type: "book", datetime: "2026-07-15T08:00" },
      }),
    )

    const res = await voiceAgentReply([{ role: "user", content: "today at 8am" }], "en")

    expect(res.status).toBe("ok")
    if (res.status !== "ok") return
    // The past slot is refused and real alternatives are offered instead...
    expect(res.data.say.toLowerCase()).toContain("past")
    expect(res.data.say).toContain("next available")
    // ...and no action is committed on the rejected time.
    expect(res.data.action).toBeNull()
  })

  it("refuses a slot that is already taken by the only doctor", async () => {
    getAppointments.mockResolvedValue([
      { doctor_id: "d1", starts_at: new Date(2026, 6, 15, 15, 0, 0).toISOString(), duration_min: 30, status: "scheduled" },
    ])
    mistralChat.mockResolvedValue(
      JSON.stringify({
        say: "15:00 today works. Shall I book it?",
        proposed_datetime: "2026-07-15T15:00",
        action: { type: "book", datetime: "2026-07-15T15:00" },
      }),
    )

    const res = await voiceAgentReply([{ role: "user", content: "today at 3pm" }], "en")

    expect(res.status).toBe("ok")
    if (res.status !== "ok") return
    expect(res.data.action).toBeNull()
    expect(res.data.say.toLowerCase()).toContain("available")
  })

  it("keeps an action on a genuinely free future slot", async () => {
    mistralChat.mockResolvedValue(
      JSON.stringify({
        say: "I'll book you on Wednesday 15/07 at 15:00. Is that correct?",
        proposed_datetime: "2026-07-15T15:00",
        action: { type: "book", datetime: "2026-07-15T15:00" },
      }),
    )

    const res = await voiceAgentReply([{ role: "user", content: "today at 3pm" }], "en")

    expect(res.status).toBe("ok")
    if (res.status !== "ok") return
    expect(res.data.action).not.toBeNull()
    expect(res.data.action?.datetime).toBe("2026-07-15T15:00")
  })
})
