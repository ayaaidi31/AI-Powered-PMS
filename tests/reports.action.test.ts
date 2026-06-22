import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({ query: vi.fn(), client: { query: vi.fn() }, getCurrentDoctor: vi.fn() }))
vi.mock("@/lib/db", () => ({
  query: (...a: unknown[]) => h.query(...a),
  sql: vi.fn(),
  withTransaction: async (fn: (c: { query: typeof h.client.query }) => unknown) => fn(h.client),
  pool: {},
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/queries", () => ({ getCurrentDoctor: (...a: unknown[]) => h.getCurrentDoctor(...a) }))

import { deleteReport } from "@/lib/actions/reports"

beforeEach(() => {
  h.query.mockReset(); h.client.query.mockReset(); h.getCurrentDoctor.mockReset()
})

const selectReport = (over: Record<string, unknown>) =>
  h.query.mockResolvedValueOnce({ rows: [{ id: "r1", doctor_id: "doc1", status: "draft", deleted_at: null, ...over }], rowCount: 1 })

describe("deleteReport (two-tier removal, doctor-only)", () => {
  it("requires a reason", async () => {
    expect((await deleteReport("r1", "  ")).status).toBe("error")
  })

  it("requires a doctor session", async () => {
    h.getCurrentDoctor.mockResolvedValue(null)
    expect((await deleteReport("r1", "x")).status).toBe("error")
  })

  it("only the authoring doctor may remove a report", async () => {
    h.getCurrentDoctor.mockResolvedValue({ id: "doc1" })
    selectReport({ doctor_id: "doc2" })
    expect((await deleteReport("r1", "x")).status).toBe("error")
  })

  it("hard-deletes a draft (report + codes)", async () => {
    h.getCurrentDoctor.mockResolvedValue({ id: "doc1" })
    selectReport({ status: "draft" })
    const r = await deleteReport("r1", "wrong patient")
    expect(r.status).toBe("ok")
    if (r.status === "ok") expect(r.data.action).toBe("deleted")
    expect(h.client.query).toHaveBeenCalledTimes(2) // delete codes, delete report
  })

  it("retracts an approved report (soft, retained — not erased)", async () => {
    h.getCurrentDoctor.mockResolvedValue({ id: "doc1" })
    selectReport({ status: "approved" })
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE soft-delete
    const r = await deleteReport("r1", "issued in error")
    expect(r.status).toBe("ok")
    if (r.status === "ok") expect(r.data.action).toBe("retracted")
    expect(h.client.query).not.toHaveBeenCalled() // no hard delete
  })

  it("does not retract an already-retracted report", async () => {
    h.getCurrentDoctor.mockResolvedValue({ id: "doc1" })
    selectReport({ status: "approved", deleted_at: "2026-01-01T00:00:00Z" })
    expect((await deleteReport("r1", "x")).status).toBe("error")
  })
})
