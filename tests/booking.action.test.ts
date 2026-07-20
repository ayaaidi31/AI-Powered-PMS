import { describe, it, expect, vi, beforeEach } from "vitest"

// bookAppointment (F2). Focus: the concurrency conflict path (UAT-02 / INT-B1),
// the Zod validation gate, authentication, and doctor lookup. The advisory lock
// itself is a database concern; here we verify the action's overlap-then-conflict
// return contract by driving the transactional client's query results.
const h = vi.hoisted(() => ({
  client: { query: vi.fn() },
  query: vi.fn(),
  getDoctorById: vi.fn(),
  getPatientById: vi.fn(),
  requireSession: vi.fn(),
}))
vi.mock("@/lib/db", () => ({
  query: (...a: unknown[]) => h.query(...a),
  sql: vi.fn(),
  withTransaction: async (fn: (c: { query: typeof h.client.query }) => unknown) => fn(h.client),
  pool: {},
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/queries", () => ({
  getCurrentReceptionist: vi.fn(),
  getAppointmentsByDoctor: vi.fn(),
  getDoctorById: (...a: unknown[]) => h.getDoctorById(...a),
  getPatientById: (...a: unknown[]) => h.getPatientById(...a),
}))
vi.mock("@/lib/auth/guard", () => ({
  requireSession: (...a: unknown[]) => h.requireSession(...a),
  requireStaff: vi.fn(),
  requireSessionScoped: vi.fn(),
}))
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => false, sendCheckInCodeEmail: vi.fn() }))
vi.mock("@/lib/check-in-code", () => ({ generateCheckInCode: () => "ABC123", normalizeCheckInCode: (s: string) => s }))

import { bookAppointment } from "@/lib/actions/appointments"

const DOCTOR = "11111111-1111-1111-1111-111111111111"
const PATIENT = "22222222-2222-2222-2222-222222222222"
const RECEPTION = { userId: "u1", role: "receptionist", profileId: "rec1", email: "r@c.de", name: "Rec" }
const inHours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString()
const input = () => ({ patient_id: PATIENT, doctor_id: DOCTOR, starts_at: inHours(48), duration_min: 30, reason: "check-up", source: "manual" as const })

beforeEach(() => {
  h.client.query.mockReset(); h.query.mockReset()
  h.getDoctorById.mockReset(); h.getPatientById.mockReset(); h.requireSession.mockReset()
  h.requireSession.mockResolvedValue({ ok: true, value: RECEPTION })
  h.getDoctorById.mockResolvedValue({ id: DOCTOR, last_name: "Smith", is_available: true, unavailable_from: null, unavailable_until: null })
})

describe("bookAppointment (F2 — REQ-SCHED-03/04, concurrency)", () => {
  it("returns a conflict when the slot was just taken (UAT-02 / INT-B1)", async () => {
    h.client.query.mockResolvedValueOnce({ rowCount: 0 }) // advisory lock
    h.client.query.mockResolvedValueOnce({ rows: [{ id: "other" }], rowCount: 1 }) // overlapping appointment found
    const r = await bookAppointment(input())
    expect(r.status).toBe("conflict")
    expect(h.client.query).toHaveBeenCalledTimes(2) // INSERT never reached
  })

  it("books the appointment and issues a check-in code when the slot is free", async () => {
    h.client.query.mockResolvedValueOnce({ rowCount: 0 }) // advisory lock
    h.client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }) // no overlap
    h.client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }) // check-in code is unique
    h.client.query.mockResolvedValueOnce({
      rows: [{ id: "a1", status: "scheduled", check_in_code: "ABC123", starts_at: inHours(48) }],
      rowCount: 1,
    }) // INSERT ... RETURNING *
    const r = await bookAppointment(input())
    expect(r.status).toBe("ok")
    if (r.status === "ok") expect(r.data.status).toBe("scheduled")
  })

  it("rejects a malformed payload before any DB access (Zod gate)", async () => {
    const r = await bookAppointment({ ...input(), doctor_id: "not-a-uuid" })
    expect(r.status).toBe("error")
    expect(h.getDoctorById).not.toHaveBeenCalled()
    expect(h.client.query).not.toHaveBeenCalled()
  })

  it("refuses an unauthenticated caller (no DB touched)", async () => {
    h.requireSession.mockResolvedValue({ ok: false, error: { status: "error", message: "Please sign in." } })
    expect((await bookAppointment(input())).status).toBe("error")
    expect(h.getDoctorById).not.toHaveBeenCalled()
  })

  it("fails when the doctor does not exist", async () => {
    h.getDoctorById.mockResolvedValue(null)
    expect((await bookAppointment(input())).status).toBe("error")
    expect(h.client.query).not.toHaveBeenCalled()
  })
})
