import { describe, it, expect } from "vitest"
import {
  patientName, doctorName, initials, insuranceLabel, insuranceVariant,
  formatCents, statusLabel, statusColor,
} from "@/lib/display"

describe("patientName / doctorName", () => {
  it("joins first and last name", () => {
    expect(patientName({ first_name: "Max", last_name: "Mustermann" })).toBe("Max Mustermann")
  })
  it("prefixes the doctor with Dr.", () => {
    expect(doctorName({ first_name: "Sarah", last_name: "Smith" })).toBe("Dr. Sarah Smith")
  })
  it("trims when a name part is empty", () => {
    expect(patientName({ first_name: "Max", last_name: "" })).toBe("Max")
  })
})

describe("initials", () => {
  it("takes the first letter of each name, uppercased", () => {
    expect(initials("max", "mustermann")).toBe("MM")
  })
  it("handles empty strings without throwing", () => {
    expect(initials("", "")).toBe("")
    expect(initials("a", "")).toBe("A")
  })
})

describe("insuranceLabel / insuranceVariant", () => {
  it("maps each insurance type to its label", () => {
    expect(insuranceLabel("gkv")).toBe("GKV")
    expect(insuranceLabel("pkv")).toBe("PKV")
    expect(insuranceLabel("selbstzahler")).toBe("Self-Pay")
  })
  it("maps each insurance type to a badge variant", () => {
    expect(insuranceVariant("gkv")).toBe("default")
    expect(insuranceVariant("pkv")).toBe("secondary")
    expect(insuranceVariant("selbstzahler")).toBe("outline")
  })
})

describe("formatCents", () => {
  it("formats cents as a German Euro string", () => {
    // Non-breaking space / formatting can vary; assert the meaningful parts.
    const s = formatCents(2530)
    expect(s).toContain("25,30")
    expect(s).toContain("€")
  })
  it("returns an em dash for null", () => {
    expect(formatCents(null)).toBe("—")
  })
  it("handles zero", () => {
    expect(formatCents(0)).toContain("0,00")
  })
})

describe("statusLabel", () => {
  it("labels every appointment status", () => {
    expect(statusLabel("scheduled")).toBe("Scheduled")
    expect(statusLabel("in_progress")).toBe("In Progress")
    expect(statusLabel("no_show")).toBe("No Show")
  })
})

describe("statusColor", () => {
  it("colors known statuses and falls back to primary", () => {
    expect(statusColor("waiting")).toBe("bg-yellow-500")
    expect(statusColor("cancelled")).toBe("bg-red-500")
    expect(statusColor("scheduled")).toBe("bg-primary") // default branch
  })
})
