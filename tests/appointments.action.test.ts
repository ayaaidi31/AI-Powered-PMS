import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({ query: vi.fn(), getCurrentReceptionist: vi.fn() }))
vi.mock("@/lib/db", () => ({
  query: (...a: unknown[]) => h.query(...a),
  sql: vi.fn(),
  withTransaction: async (fn: (c: { query: typeof h.query }) => unknown) => fn({ query: h.query }),
  pool: {},
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/queries", () => ({ getCurrentReceptionist: (...a: unknown[]) => h.getCurrentReceptionist(...a) }))

import { cancelAppointment, deleteAppointment, checkInAppointment, revertCheckIn } from "@/lib/actions/appointments"

beforeEach(() => { h.query.mockReset(); h.getCurrentReceptionist.mockReset() })

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
