import { describe, it, expect, vi, beforeEach } from "vitest"

// Report lifecycle immutability (F9 / BR-02-06, REQ-DOC-04). An approved report
// can no longer be edited or re-approved: both actions carry a
// `WHERE ... status <> 'approved'` guard, so a locked row matches nothing.
const h = vi.hoisted(() => ({ query: vi.fn(), client: { query: vi.fn() } }))
vi.mock("@/lib/db", () => ({
  query: (...a: unknown[]) => h.query(...a),
  sql: vi.fn(),
  withTransaction: async (fn: (c: { query: typeof h.client.query }) => unknown) => fn(h.client),
  pool: {},
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/queries", () => ({ getCurrentDoctor: vi.fn() }))
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => false, sendReportReadyEmail: vi.fn(), appUrl: async () => "http://localhost:3000/" }))
vi.mock("@/lib/auth/guard", () => ({
  requireDoctor: async () => ({ ok: true, value: { userId: "u1", role: "doctor", profileId: "doc1", email: "d@c.de", name: "Doc" } }),
}))

import { updateReport, approveReport } from "@/lib/actions/reports"

beforeEach(() => { h.query.mockReset(); h.client.query.mockReset() })

describe("updateReport (BR-02-06 immutability)", () => {
  it("refuses to edit an approved report (locked)", async () => {
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }) // WHERE status <> 'approved' matched nothing
    expect((await updateReport("r1", { diagnosis: "Updated" })).status).toBe("error")
  })

  it("updates a draft / pending report", async () => {
    h.query.mockResolvedValueOnce({ rows: [{ id: "r1", diagnosis: "Updated", status: "draft" }], rowCount: 1 })
    expect((await updateReport("r1", { diagnosis: "Updated" })).status).toBe("ok")
  })

  it("rejects an empty update before any DB access", async () => {
    expect((await updateReport("r1", {})).status).toBe("error")
    expect(h.query).not.toHaveBeenCalled()
  })

  it("rejects an invalid status (only draft / pending_approval may be set)", async () => {
    const r = await updateReport("r1", { status: "approved" as unknown as "draft" })
    expect(r.status).toBe("error")
    expect(h.query).not.toHaveBeenCalled()
  })
})

describe("approveReport (REQ-DOC-04, once-only)", () => {
  it("approves a not-yet-approved report", async () => {
    h.query.mockResolvedValueOnce({ rows: [{ id: "r1", status: "approved", patient_id: "p1" }], rowCount: 1 })
    expect((await approveReport("r1")).status).toBe("ok")
  })

  it("refuses to re-approve an already-approved report", async () => {
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }) // WHERE status <> 'approved' matched nothing
    expect((await approveReport("r1")).status).toBe("error")
  })
})
