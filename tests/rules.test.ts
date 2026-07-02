import { describe, it, expect } from "vitest"
import {
  isPortalEligible, isReportEditable, reportRemovalMode, appointmentDeletable, cancellationCheck,
  checkInDecision, canRevertCheckIn,
} from "@/lib/rules"

describe("isPortalEligible (REQ-REC-13)", () => {
  it("is true when email or phone is present", () => {
    expect(isPortalEligible("a@b.de", null)).toBe(true)
    expect(isPortalEligible(null, "030 123")).toBe(true)
  })
  it("is false for an analog patient with no digital contact", () => {
    expect(isPortalEligible(null, null)).toBe(false)
  })
})

describe("isReportEditable (BR-02-06)", () => {
  it("allows editing drafts and pending, but not approved", () => {
    expect(isReportEditable("draft")).toBe(true)
    expect(isReportEditable("pending_approval")).toBe(true)
    expect(isReportEditable("approved")).toBe(false)
  })
})

describe("reportRemovalMode (§630f retention)", () => {
  it("retracts approved reports and hard-deletes drafts", () => {
    expect(reportRemovalMode("approved")).toBe("retract")
    expect(reportRemovalMode("draft")).toBe("hard")
    expect(reportRemovalMode("pending_approval")).toBe("hard")
  })
})

describe("appointmentDeletable", () => {
  it("allows deleting a mistaken scheduled appointment with no records", () => {
    expect(appointmentDeletable({ status: "scheduled", hasReport: false, hasInvoice: false }).ok).toBe(true)
    expect(appointmentDeletable({ status: "cancelled", hasReport: false, hasInvoice: false }).ok).toBe(true)
    expect(appointmentDeletable({ status: "no_show", hasReport: false, hasInvoice: false }).ok).toBe(true)
  })
  it("blocks deletion of in-progress / completed appointments", () => {
    expect(appointmentDeletable({ status: "completed", hasReport: false, hasInvoice: false }).ok).toBe(false)
    expect(appointmentDeletable({ status: "in_progress", hasReport: false, hasInvoice: false }).ok).toBe(false)
    expect(appointmentDeletable({ status: "waiting", hasReport: false, hasInvoice: false }).ok).toBe(false)
  })
  it("blocks deletion when a report or invoice is attached", () => {
    expect(appointmentDeletable({ status: "scheduled", hasReport: true, hasInvoice: false }).ok).toBe(false)
    expect(appointmentDeletable({ status: "scheduled", hasReport: false, hasInvoice: true }).ok).toBe(false)
  })
})

describe("checkInDecision (Feature 3 self check-in / Feature 6 manual)", () => {
  it("transitions a scheduled appointment to waiting (REQ-PAT-03 / REQ-REC-07)", () => {
    expect(checkInDecision({ status: "scheduled", isAppointmentToday: true, enforceSameDay: false }).action).toBe("ok")
  })
  it("is idempotent — a second check-in is a no-op (REQ-PAT-05)", () => {
    expect(checkInDecision({ status: "waiting", isAppointmentToday: true, enforceSameDay: true }).action).toBe("already")
  })
  it("blocks check-in for non-scheduled statuses", () => {
    for (const status of ["completed", "cancelled", "in_progress", "no_show"]) {
      expect(checkInDecision({ status, isAppointmentToday: true, enforceSameDay: false }).action).toBe("blocked")
    }
  })
  it("self-service restricts check-in to the appointment day (REQ-PAT-02)", () => {
    const d = checkInDecision({ status: "scheduled", isAppointmentToday: false, enforceSameDay: true })
    expect(d.action).toBe("blocked")
    if (d.action === "blocked") expect(d.reason).toMatch(/day of your appointment/)
  })
  it("manual (reception) check-in is NOT restricted to the same day", () => {
    expect(checkInDecision({ status: "scheduled", isAppointmentToday: false, enforceSameDay: false }).action).toBe("ok")
  })
})

describe("canRevertCheckIn (Feature 6 undo)", () => {
  it("allows undo only while waiting", () => {
    expect(canRevertCheckIn("waiting")).toBe(true)
    expect(canRevertCheckIn("scheduled")).toBe(false)
    expect(canRevertCheckIn("in_progress")).toBe(false)
  })
})

describe("cancellationCheck (REQ-MOD-05)", () => {
  const now = Date.UTC(2026, 5, 18, 9, 0)
  const inHours = (h: number) => now + h * 3_600_000

  it("rejects an already-cancelled appointment", () => {
    expect(cancellationCheck("cancelled", inHours(48), false, now).ok).toBe(false)
  })
  it("rejects cancelling after check-in (not scheduled)", () => {
    expect(cancellationCheck("waiting", inHours(48), false, now).ok).toBe(false)
  })
  it("allows staff cancellation regardless of the 24h window", () => {
    expect(cancellationCheck("scheduled", inHours(2), false, now).ok).toBe(true)
  })
  it("blocks self-service cancellation inside 24 hours", () => {
    expect(cancellationCheck("scheduled", inHours(2), true, now).ok).toBe(false)
  })
  it("allows self-service cancellation outside 24 hours", () => {
    expect(cancellationCheck("scheduled", inHours(48), true, now).ok).toBe(true)
  })
})
