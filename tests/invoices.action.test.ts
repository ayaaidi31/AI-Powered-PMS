import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db", () => ({
  query: (...a: unknown[]) => h.query(...a),
  sql: vi.fn(),
  withTransaction: async (fn: (c: { query: typeof h.query }) => unknown) => fn({ query: h.query }),
  pool: {},
}))
vi.mock("@/lib/email", () => ({ isEmailConfigured: () => false, sendInvoiceReadyEmail: vi.fn(), appUrl: async () => "http://localhost:3000/" }))
vi.mock("@/lib/auth/guard", () => ({
  requireReceptionist: async () => ({ ok: true, value: { userId: "u1", role: "receptionist", profileId: "rec1", email: "r@c.de", name: "Rec" } }),
}))

import { generateInvoice } from "@/lib/actions/invoices"

beforeEach(() => { h.query.mockReset() })

const YEAR = new Date().getFullYear() // generateInvoice numbers invoices by the current year

/** The appointment+patient row returned by the first SELECT in generateInvoice. */
const apptRow = (over: Record<string, unknown> = {}) => ({
  patient_id: "p1", insurance_type: "pkv", status: "completed",
  insurer_name: null, insurer_ik: null, versicherten_id: null, ...over,
})

describe("generateInvoice (Feature 7 — invoice generation, UC-REC-01)", () => {
  it("fails when the appointment does not exist", async () => {
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    expect((await generateInvoice("a1")).status).toBe("error")
  })

  it("blocks billing an appointment that is not completed", async () => {
    h.query.mockResolvedValueOnce({ rows: [apptRow({ status: "scheduled" })], rowCount: 1 })
    const r = await generateInvoice("a1")
    expect(r.status).toBe("error")
    expect(h.query).toHaveBeenCalledTimes(1) // stops before the duplicate check
  })

  it("rejects a second (non-storno) invoice for the same appointment", async () => {
    h.query.mockResolvedValueOnce({ rows: [apptRow()], rowCount: 1 })          // appt
    h.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 })  // existing invoice
    expect((await generateInvoice("a1")).status).toBe("error")
    expect(h.query).toHaveBeenCalledTimes(2)
  })

  it("blocks finalisation when no billing codes are attached (REQ-REC-05)", async () => {
    h.query.mockResolvedValueOnce({ rows: [apptRow()], rowCount: 1 }) // appt
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })          // no existing
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })          // no codes
    expect((await generateInvoice("a1")).status).toBe("error")
    expect(h.query).toHaveBeenCalledTimes(3)
  })

  it("rejects a catalog mismatch (GKV patient must be billed with EBM)", async () => {
    h.query.mockResolvedValueOnce({ rows: [apptRow({ insurance_type: "gkv" })], rowCount: 1 })
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    h.query.mockResolvedValueOnce({ rows: [{ catalog: "GOAE", multiplier: null, base_cents: 1000, default_multiplier: 2.3 }], rowCount: 1 })
    const r = await generateInvoice("a1")
    expect(r.status).toBe("error")
    if (r.status === "error") expect(r.message).toMatch(/EBM/)
  })

  it("generates a private (PKV) invoice with a computed total and sequential number", async () => {
    h.query.mockResolvedValueOnce({ rows: [apptRow({ insurance_type: "pkv" })], rowCount: 1 })        // appt
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })                                          // no existing
    h.query.mockResolvedValueOnce({ rows: [{ catalog: "GOAE", multiplier: 2.3, base_cents: 1000, default_multiplier: 2.3 }], rowCount: 1 }) // codes
    h.query.mockResolvedValueOnce({ rowCount: 0 })                                                    // advisory lock
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })                                          // last invoice number (none)
    h.query.mockResolvedValueOnce({ rows: [{ id: "inv1", status: "pending_payment", total_cents: 2300 }], rowCount: 1 }) // INSERT
    const r = await generateInvoice("a1")
    if (r.status !== "ok") throw new Error(r.message)
    expect(r.data.status).toBe("pending_payment")
    expect(h.query).toHaveBeenCalledTimes(6)
    // The INSERT (6th call) receives the computed total: 1000 cents × 2.3 = 2300.
    const insertArgs = h.query.mock.calls[5][1] as unknown[]
    expect(insertArgs[0]).toBe(`${YEAR}-0001`) // first number of the year
    expect(insertArgs[4]).toBe(2300)           // total_cents
  })

  it("generates a statutory (GKV) invoice queued for the KV batch with no total", async () => {
    h.query.mockResolvedValueOnce({ rows: [apptRow({ insurance_type: "gkv" })], rowCount: 1 })        // appt
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })                                          // no existing
    h.query.mockResolvedValueOnce({ rows: [{ catalog: "EBM", multiplier: null, base_cents: null, default_multiplier: null }], rowCount: 1 }) // codes
    h.query.mockResolvedValueOnce({ rowCount: 0 })                                                    // advisory lock
    h.query.mockResolvedValueOnce({ rows: [{ invoice_number: `${YEAR}-0007` }], rowCount: 1 })        // last number
    h.query.mockResolvedValueOnce({ rows: [{ id: "inv2", status: "ready_for_kv", total_cents: null }], rowCount: 1 }) // INSERT
    const r = await generateInvoice("a1")
    if (r.status !== "ok") throw new Error(r.message)
    expect(r.data.status).toBe("ready_for_kv")
    const insertArgs = h.query.mock.calls[5][1] as unknown[]
    expect(insertArgs[0]).toBe(`${YEAR}-0008`) // next after 0007
    expect(insertArgs[4]).toBeNull()           // no monetary total for GKV
  })

  it("freezes the payer identity (insurer + KVNR) onto the invoice at finalisation", async () => {
    // The patient's insurer and KVNR at the time of billing must be captured on
    // the invoice so a later switch of Krankenkasse cannot alter the settled
    // document.
    h.query.mockResolvedValueOnce({ rows: [apptRow({ insurance_type: "gkv", insurer_name: "AOK Nordost", insurer_ik: "101097008", versicherten_id: "A123456789" })], rowCount: 1 })
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })                                          // no existing
    h.query.mockResolvedValueOnce({ rows: [{ catalog: "EBM", multiplier: null, base_cents: null, default_multiplier: null }], rowCount: 1 }) // codes
    h.query.mockResolvedValueOnce({ rowCount: 0 })                                                    // advisory lock
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })                                          // last number (none)
    h.query.mockResolvedValueOnce({ rows: [{ id: "inv3", status: "ready_for_kv", total_cents: null }], rowCount: 1 }) // INSERT
    const r = await generateInvoice("a1")
    if (r.status !== "ok") throw new Error(r.message)
    const insertArgs = h.query.mock.calls[5][1] as unknown[]
    expect(insertArgs[7]).toBe("AOK Nordost")  // insurer_name snapshot
    expect(insertArgs[8]).toBe("101097008")    // insurer_ik snapshot
    expect(insertArgs[9]).toBe("A123456789")   // versicherten_id (KVNR) snapshot
  })
})
