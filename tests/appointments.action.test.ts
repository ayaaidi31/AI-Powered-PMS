import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({
  query: vi.fn(), getCurrentReceptionist: vi.fn(), getAppointmentsByDoctor: vi.fn(),
  requireSession: vi.fn(), requireStaff: vi.fn(), requireSessionScoped: vi.fn(),
}))
vi.mock("@/lib/db", () => ({
  query: (...a: unknown[]) => h.query(...a),
  sql: vi.fn(),
  withTransaction: async (fn: (c: { query: typeof h.query }) => unknown) => fn({ query: h.query }),
  pool: {},
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/queries", () => ({
  getCurrentReceptionist: (...a: unknown[]) => h.getCurrentReceptionist(...a),
  getAppointmentsByDoctor: (...a: unknown[]) => h.getAppointmentsByDoctor(...a),
}))
vi.mock("@/lib/auth/guard", () => ({
  requireSession: (...a: unknown[]) => h.requireSession(...a),
  requireStaff: (...a: unknown[]) => h.requireStaff(...a),
  requireSessionScoped: (...a: unknown[]) => h.requireSessionScoped(...a),
}))

import {
  cancelAppointment, deleteAppointment, checkInAppointment, revertCheckIn,
  reassignAppointment, reviewVoiceBooking, getDoctorDayAvailability,
} from "@/lib/actions/appointments"

// Default: an authorized staff caller (so business-logic tests focus on behaviour;
// authz denials are exercised explicitly below).
const STAFF = { userId: "u1", role: "receptionist", profileId: "rec1", email: "r@c.de", name: "Rec" }
beforeEach(() => {
  h.query.mockReset(); h.getCurrentReceptionist.mockReset()
  h.requireSession.mockResolvedValue({ ok: true, value: STAFF })
  h.requireStaff.mockResolvedValue({ ok: true, value: STAFF })
  h.requireSessionScoped.mockResolvedValue({ ok: true, value: { session: STAFF, isStaff: true, patientId: null } })
})

const inHours = (hrs: number) => new Date(Date.now() + hrs * 3_600_000).toISOString()
const appt = (over: Record<string, unknown>) => ({ id: "a1", status: "scheduled", starts_at: inHours(48), duration_min: 30, ...over })

describe("cancelAppointment (REQ-MOD-05 24h window)", () => {
  it("blocks an already-cancelled appointment", async () => {
    h.query.mockResolvedValueOnce({ rows: [appt({ status: "cancelled" })], rowCount: 1 })
    expect((await cancelAppointment("a1")).status).toBe("error")
  })

  it("blocks self-service cancellation inside 24 hours", async () => {
    h.query.mockResolvedValueOnce({ rows: [appt({ starts_at: inHours(2) })], rowCount: 1 })
    const r = await cancelAppointment("a1", { enforce24hWindow: true })
    expect(r.status).toBe("error")
    expect(h.query).toHaveBeenCalledTimes(1) // UPDATE not reached
  })

  it("allows staff cancellation inside 24 hours", async () => {
    h.query.mockResolvedValueOnce({ rows: [appt({ starts_at: inHours(2) })], rowCount: 1 }) // SELECT
    h.query.mockResolvedValueOnce({ rows: [appt({ status: "cancelled" })], rowCount: 1 }) // UPDATE
    expect((await cancelAppointment("a1")).status).toBe("ok")
  })
})

describe("deleteAppointment (mistake-only, receptionist)", () => {
  it("requires a receptionist session", async () => {
    h.getCurrentReceptionist.mockResolvedValue(null)
    expect((await deleteAppointment("a1", "x")).status).toBe("error")
  })

  it("blocks deleting an appointment that has a report", async () => {
    h.getCurrentReceptionist.mockResolvedValue({ id: "rec1" })
    h.query.mockResolvedValueOnce({ rows: [appt({})], rowCount: 1 }) // SELECT appt
    h.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 }) // has report
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no invoice
    expect((await deleteAppointment("a1", "x")).status).toBe("error")
  })

  it("deletes a clean mistaken appointment", async () => {
    h.getCurrentReceptionist.mockResolvedValue({ id: "rec1" })
    h.query.mockResolvedValueOnce({ rows: [appt({})], rowCount: 1 }) // SELECT appt
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no report
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no invoice
    h.query.mockResolvedValueOnce({ rowCount: 1 }) // DELETE
    expect((await deleteAppointment("a1", "duplicate entry")).status).toBe("ok")
  })
})

describe("checkInAppointment (Feature 3 self check-in / Feature 6 manual)", () => {
  it("fails when the appointment does not exist", async () => {
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    expect((await checkInAppointment("a1")).status).toBe("error")
  })

  it("is idempotent for an already-checked-in patient (REQ-PAT-05)", async () => {
    h.query.mockResolvedValueOnce({ rows: [appt({ status: "waiting" })], rowCount: 1 })
    expect((await checkInAppointment("a1")).status).toBe("ok")
    expect(h.query).toHaveBeenCalledTimes(1) // no UPDATE — no duplicate check-in
  })

  it("blocks check-in for a non-scheduled appointment", async () => {
    h.query.mockResolvedValueOnce({ rows: [appt({ status: "completed" })], rowCount: 1 })
    expect((await checkInAppointment("a1")).status).toBe("error")
    expect(h.query).toHaveBeenCalledTimes(1)
  })

  it("self-service: blocks check-in when not the appointment day (REQ-PAT-02)", async () => {
    h.query.mockResolvedValueOnce({ rows: [appt({ starts_at: inHours(48) })], rowCount: 1 }) // 2 days away
    const r = await checkInAppointment("a1", { enforceSameDay: true })
    expect(r.status).toBe("error")
    expect(h.query).toHaveBeenCalledTimes(1) // UPDATE not reached
  })

  it("manual (reception) check-in transitions scheduled → waiting (REQ-REC-07)", async () => {
    h.query.mockResolvedValueOnce({ rows: [appt({})], rowCount: 1 }) // SELECT (no enforceSameDay)
    h.query.mockResolvedValueOnce({ rows: [appt({ status: "waiting" })], rowCount: 1 }) // UPDATE
    expect((await checkInAppointment("a1")).status).toBe("ok")
    expect(h.query).toHaveBeenCalledTimes(2)
  })
})

describe("revertCheckIn (Feature 6 undo)", () => {
  it("reverts while still waiting", async () => {
    h.query.mockResolvedValueOnce({ rows: [appt({ status: "scheduled" })], rowCount: 1 }) // UPDATE matched
    expect((await revertCheckIn("a1")).status).toBe("ok")
  })
  it("fails once the patient is no longer waiting", async () => {
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }) // WHERE status='waiting' matched nothing
    expect((await revertCheckIn("a1")).status).toBe("error")
  })
})

describe("reassignAppointment (Feature 8/18 — move to another doctor)", () => {
  it("fails when the appointment does not exist", async () => {
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT current
    expect((await reassignAppointment("a1", "docB")).status).toBe("error")
  })

  it("is a no-op (ok) when already assigned to that doctor", async () => {
    h.query.mockResolvedValueOnce({ rows: [appt({ doctor_id: "docB" })], rowCount: 1 })
    const r = await reassignAppointment("a1", "docB")
    expect(r.status).toBe("ok")
    expect(h.query).toHaveBeenCalledTimes(1) // no lock / clash / update
  })

  it("returns a conflict when the target doctor is already booked", async () => {
    h.query.mockResolvedValueOnce({ rows: [appt({ doctor_id: "docA" })], rowCount: 1 }) // SELECT
    h.query.mockResolvedValueOnce({ rowCount: 0 }) // advisory lock
    h.query.mockResolvedValueOnce({ rows: [{ id: "other" }], rowCount: 1 }) // clash found
    const r = await reassignAppointment("a1", "docB")
    expect(r.status).toBe("conflict")
    expect(h.query).toHaveBeenCalledTimes(3) // UPDATE not reached
  })

  it("moves the appointment when the target slot is free", async () => {
    h.query.mockResolvedValueOnce({ rows: [appt({ doctor_id: "docA" })], rowCount: 1 }) // SELECT
    h.query.mockResolvedValueOnce({ rowCount: 0 }) // advisory lock
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no clash
    h.query.mockResolvedValueOnce({ rows: [appt({ doctor_id: "docB" })], rowCount: 1 }) // UPDATE
    const r = await reassignAppointment("a1", "docB")
    expect(r.status).toBe("ok")
    expect(h.query).toHaveBeenCalledTimes(4)
  })
})

describe("authorization (defence-in-depth)", () => {
  const denied = { ok: false, error: { status: "error", message: "Please sign in." } }

  it("cancelAppointment refuses an unauthenticated caller (no DB touched)", async () => {
    h.requireSessionScoped.mockResolvedValue(denied)
    expect((await cancelAppointment("a1")).status).toBe("error")
    expect(h.query).not.toHaveBeenCalled()
  })

  it("cancelAppointment refuses a patient acting on someone else's appointment", async () => {
    h.requireSessionScoped.mockResolvedValue({ ok: true, value: { session: {}, isStaff: false, patientId: "patA" } })
    h.query.mockResolvedValueOnce({ rows: [appt({ patient_id: "patB" })], rowCount: 1 }) // SELECT — not theirs
    const r = await cancelAppointment("a1", { enforce24hWindow: true })
    expect(r.status).toBe("error")
    expect(h.query).toHaveBeenCalledTimes(1) // UPDATE never reached
  })

  it("reassignAppointment refuses a non-staff caller", async () => {
    h.requireStaff.mockResolvedValue(denied)
    expect((await reassignAppointment("a1", "docB")).status).toBe("error")
    expect(h.query).not.toHaveBeenCalled()
  })
})

describe("reviewVoiceBooking (Feature 11 — receptionist review of AI bookings)", () => {
  it("requires a receptionist session", async () => {
    h.getCurrentReceptionist.mockResolvedValue(null)
    expect((await reviewVoiceBooking("a1", "confirmed")).status).toBe("error")
    expect(h.query).not.toHaveBeenCalled()
  })

  it("rejects an invalid review status", async () => {
    h.getCurrentReceptionist.mockResolvedValue({ id: "rec1" })
    expect((await reviewVoiceBooking("a1", "banana" as "confirmed")).status).toBe("error")
    expect(h.query).not.toHaveBeenCalled()
  })

  it("fails when the appointment is not an AI booking", async () => {
    h.getCurrentReceptionist.mockResolvedValue({ id: "rec1" })
    h.query.mockResolvedValueOnce({ rowCount: 0 }) // UPDATE matched nothing (source <> 'ai_voice')
    expect((await reviewVoiceBooking("a1", "flagged")).status).toBe("error")
  })

  it("marks a genuine AI booking as confirmed", async () => {
    h.getCurrentReceptionist.mockResolvedValue({ id: "rec1" })
    h.query.mockResolvedValueOnce({ rowCount: 1 }) // UPDATE matched
    expect((await reviewVoiceBooking("a1", "confirmed")).status).toBe("ok")
  })
})

describe("getDoctorDayAvailability (booking-form slot grid)", () => {
  // A weekday about five weeks out, so no slot trips the past/too-soon/weekend rules.
  const future = (() => {
    const d = new Date(Date.now() + 35 * 86_400_000)
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
    return d
  })()
  const dateStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`

  it("returns the full clinic grid, all free when the doctor has no appointments", async () => {
    h.getAppointmentsByDoctor.mockResolvedValue([])
    const r = await getDoctorDayAvailability("docA", dateStr)
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.data).toHaveLength(18) // every clinic start time is present...
    expect(r.data.every((s) => s.available)).toBe(true) // ...and open
  })

  it("marks a slot taken by an active appointment as unavailable", async () => {
    const startsAt = new Date(`${dateStr}T09:00:00`).toISOString()
    h.getAppointmentsByDoctor.mockResolvedValue([
      { id: "x", doctor_id: "docA", starts_at: startsAt, duration_min: 30, status: "scheduled" },
    ])
    const r = await getDoctorDayAvailability("docA", dateStr)
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.data.find((s) => s.time === "09:00")?.available).toBe(false)
    expect(r.data.find((s) => s.time === "09:30")?.available).toBe(true)
  })

  it("excludes the appointment being rescheduled so its own slot stays open", async () => {
    const startsAt = new Date(`${dateStr}T09:00:00`).toISOString()
    h.getAppointmentsByDoctor.mockResolvedValue([
      { id: "self", doctor_id: "docA", starts_at: startsAt, duration_min: 30, status: "scheduled" },
    ])
    const r = await getDoctorDayAvailability("docA", dateStr, "self")
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.data.find((s) => s.time === "09:00")?.available).toBe(true)
  })

  it("refuses an unauthenticated caller", async () => {
    h.requireSession.mockResolvedValue({ ok: false, error: { status: "error", message: "Please sign in." } })
    expect((await getDoctorDayAvailability("docA", dateStr)).status).toBe("error")
  })

  it("rejects a malformed date", async () => {
    expect((await getDoctorDayAvailability("docA", "07/31/2026")).status).toBe("error")
  })
})
