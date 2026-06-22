import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({ sql: vi.fn(), query: vi.fn() }))
vi.mock("@/lib/db", () => ({
  sql: (...a: unknown[]) => h.sql(...a),
  query: (...a: unknown[]) => h.query(...a),
  withTransaction: async (fn: (c: { query: typeof h.query }) => unknown) => fn({ query: h.query }),
  pool: {},
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { registerPatient, updatePatient, deactivatePatient } from "@/lib/actions/patients"

beforeEach(() => { h.sql.mockReset(); h.query.mockReset() })

const valid = { first_name: "Max", last_name: "Mustermann", birth_date: "1985-04-14", insurance_type: "gkv" as const, email: "max@x.de" }

describe("registerPatient (CRUD create + REQ-REC-11 duplicate)", () => {
  it("rejects invalid input before any DB call", async () => {
    const r = await registerPatient({ ...valid, first_name: "" })
    expect(r.status).toBe("error")
    expect(h.sql).not.toHaveBeenCalled()
  })

  it("returns a conflict when a duplicate name + DOB exists", async () => {
    h.sql.mockResolvedValueOnce([{ id: "p1", first_name: "Max", last_name: "Mustermann" }])
    const r = await registerPatient(valid)
    expect(r.status).toBe("conflict")
    if (r.status === "conflict") expect(r.data?.id).toBe("p1")
    expect(h.sql).toHaveBeenCalledTimes(1) // INSERT not reached
  })

  it("inserts and returns the new patient when unique", async () => {
    h.sql.mockResolvedValueOnce([]) // no duplicate
    h.sql.mockResolvedValueOnce([{ id: "p2", is_digital_active: true }]) // INSERT RETURNING
    const r = await registerPatient(valid)
    expect(r.status).toBe("ok")
    if (r.status === "ok") expect(r.data.id).toBe("p2")
    expect(h.sql).toHaveBeenCalledTimes(2)
  })

  it("skips the duplicate check when allowDuplicate is set", async () => {
    h.sql.mockResolvedValueOnce([{ id: "p3" }]) // INSERT only
    const r = await registerPatient(valid, true)
    expect(r.status).toBe("ok")
    expect(h.sql).toHaveBeenCalledTimes(1)
  })
})

describe("updatePatient (CRUD update)", () => {
  it("fails when no fields are supplied", async () => {
    expect((await updatePatient("p1", {})).status).toBe("error")
    expect(h.query).not.toHaveBeenCalled()
  })
  it("updates and returns the row", async () => {
    h.query.mockResolvedValueOnce({ rows: [{ id: "p1", phone: "030" }], rowCount: 1 })
    const r = await updatePatient("p1", { phone: "030" })
    expect(r.status).toBe("ok")
  })
  it("reports not found when no row matched", async () => {
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    expect((await updatePatient("missing", { phone: "030" })).status).toBe("error")
  })
})

describe("deactivatePatient (soft delete, §630f)", () => {
  it("soft-deletes an active patient", async () => {
    h.query.mockResolvedValueOnce({ rowCount: 1 })
    expect((await deactivatePatient("p1")).status).toBe("ok")
  })
  it("fails when already inactive or missing", async () => {
    h.query.mockResolvedValueOnce({ rowCount: 0 })
    expect((await deactivatePatient("p1")).status).toBe("error")
  })
})
