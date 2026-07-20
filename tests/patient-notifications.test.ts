import { describe, it, expect } from "vitest"
import { buildPatientNotifications as bpnRaw, WINDOW_DAYS, type PatientNotifInput } from "@/lib/patient-notifications"
import { en } from "@/lib/i18n/messages/en"
import { translate, type TFunction } from "@/lib/i18n/translate"

// Supply a real English translator so the assertions below check the resolved text.
const t: TFunction = (key, vars) => translate(en, key, vars)
const bpn = (input: PatientNotifInput) => bpnRaw(input, t)

const NOW = Date.UTC(2026, 5, 15, 9, 0, 0) // fixed "now"
const hours = (n: number) => new Date(NOW + n * 3_600_000).toISOString()
const days = (n: number) => new Date(NOW + n * 86_400_000).toISOString()

const base: PatientNotifInput = {
  nowMs: NOW,
  appointments: [],
  reports: [],
  invoices: [],
  pendingProposals: 0,
}

const kinds = (input: PatientNotifInput) => bpn(input).map((n) => n.kind)
const ids = (input: PatientNotifInput) => bpn(input).map((n) => n.id)

describe("buildPatientNotifications", () => {
  it("returns nothing when there is nothing to surface", () => {
    expect(bpn(base)).toEqual([])
  })

  it("flags a clinic-cancelled appointment (recent staff change)", () => {
    const items = bpn({
      ...base,
      appointments: [{ id: "a1", starts_at: days(3), status: "cancelled", staff_modified_at: hours(-2) }],
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: "alert", href: "/patient/appointments" })
    expect(items[0].title).toMatch(/cancelled/i)
  })

  it("flags a clinic-updated (still scheduled) appointment", () => {
    const items = bpn({
      ...base,
      appointments: [{ id: "a1", starts_at: days(3), status: "scheduled", staff_modified_at: hours(-2) }],
    })
    expect(items.some((n) => n.kind === "alert" && /updated/i.test(n.title))).toBe(true)
  })

  it("does NOT flag a change the patient made themselves (no staff stamp)", () => {
    const items = bpn({
      ...base,
      appointments: [{ id: "a1", starts_at: days(3), status: "scheduled", staff_modified_at: null }],
    })
    expect(items.some((n) => n.kind === "alert")).toBe(false)
  })

  it("ignores a stale staff change (older than the window)", () => {
    const items = bpn({
      ...base,
      appointments: [{ id: "a1", starts_at: days(3), status: "scheduled", staff_modified_at: days(-(WINDOW_DAYS + 1)) }],
    })
    expect(items.some((n) => n.kind === "alert")).toBe(false)
  })

  it("offers same-day check-in for a visit today", () => {
    const items = bpn({
      ...base,
      appointments: [{ id: "a1", starts_at: hours(2), status: "scheduled", staff_modified_at: null }],
    })
    expect(items.some((n) => n.title === "Check-in available today" && n.href === "/checkin")).toBe(true)
  })

  it("reminds about an appointment within ~36h but not today", () => {
    const items = bpn({
      ...base,
      appointments: [{ id: "a1", starts_at: hours(24), status: "scheduled", staff_modified_at: null }],
    })
    expect(items.some((n) => n.title === "Appointment tomorrow")).toBe(true)
  })

  it("does not remind about a far-future or past appointment", () => {
    const future = bpn({
      ...base,
      appointments: [{ id: "a1", starts_at: days(5), status: "scheduled", staff_modified_at: null }],
    })
    const past = bpn({
      ...base,
      appointments: [{ id: "a2", starts_at: hours(-5), status: "scheduled", staff_modified_at: null }],
    })
    expect(future.some((n) => n.kind === "appointment")).toBe(false)
    expect(past.some((n) => n.kind === "appointment")).toBe(false)
  })

  it("surfaces a recent approved report and links to it", () => {
    const items = bpn({
      ...base,
      reports: [{ id: "r1", status: "approved", created_at: days(-1), approved_at: days(-1) }],
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: "report", href: "/patient/records/r1" })
    // Never leak clinical detail into the notification text.
    expect(items[0].description).not.toMatch(/diagnos/i)
  })

  it("ignores draft reports and stale approved reports", () => {
    expect(kinds({ ...base, reports: [{ id: "r1", status: "draft", created_at: days(-1), approved_at: null }] })).not.toContain("report")
    expect(kinds({ ...base, reports: [{ id: "r2", status: "approved", created_at: days(-30), approved_at: days(-30) }] })).not.toContain("report")
  })

  it("shows a payment-due notice for private/self-pay invoices only", () => {
    const pkv = kinds({ ...base, invoices: [{ id: "i1", status: "pending_payment", insurance_type: "pkv" }] })
    expect(pkv).toContain("billing")
    // GKV is billed to the insurer — never nag the patient.
    const gkv = kinds({ ...base, invoices: [{ id: "i2", status: "ready_for_kv", insurance_type: "gkv" }] })
    expect(gkv).not.toContain("billing")
    // A paid invoice is not actionable.
    const paid = kinds({ ...base, invoices: [{ id: "i3", status: "paid", insurance_type: "pkv" }] })
    expect(paid).not.toContain("billing")
  })

  it("nudges when profile updates await confirmation", () => {
    expect(ids({ ...base, pendingProposals: 2 })).toContain("profile-proposals")
    expect(ids({ ...base, pendingProposals: 0 })).not.toContain("profile-proposals")
  })

  it("orders clinic-change alerts before reminders and other items", () => {
    const items = bpn({
      ...base,
      appointments: [{ id: "a1", starts_at: hours(2), status: "scheduled", staff_modified_at: hours(-1) }],
      invoices: [{ id: "i1", status: "pending_payment", insurance_type: "pkv" }],
    })
    expect(items[0].kind).toBe("alert")
  })
})
