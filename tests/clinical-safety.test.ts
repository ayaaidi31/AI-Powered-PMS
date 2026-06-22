import { describe, it, expect } from "vitest"
import { matchAllergyAlerts } from "@/lib/clinical-safety"

describe("matchAllergyAlerts", () => {
  it("flags an exact-name allergy match", () => {
    const alerts = matchAllergyAlerts(["Penicillin"], [{ medication: "Penicillin V" }])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe("high")
    expect(alerts[0].category).toBe("allergy")
    expect(alerts[0].medication).toBe("Penicillin V")
    expect(alerts[0].message).toContain("Penicillin")
  })

  it("is case-insensitive", () => {
    expect(matchAllergyAlerts(["penicillin"], [{ medication: "PENICILLIN" }])).toHaveLength(1)
  })

  it("returns nothing for an unrelated drug", () => {
    expect(matchAllergyAlerts(["Penicillin"], [{ medication: "Ibuprofen" }])).toHaveLength(0)
  })

  it("does not match when the drug name is class-level only (handled by the AI layer)", () => {
    // Amoxicillin is a penicillin but the string doesn't contain "penicillin".
    expect(matchAllergyAlerts(["Penicillin"], [{ medication: "Amoxicillin" }])).toHaveLength(0)
  })

  it("ignores too-short tokens to avoid false positives", () => {
    expect(matchAllergyAlerts(["ab"], [{ medication: "ab" }])).toHaveLength(0)
  })

  it("flags every matching prescription across multiple allergies", () => {
    const alerts = matchAllergyAlerts(
      ["Penicillin", "Aspirin"],
      [{ medication: "Penicillin G" }, { medication: "Aspirin 100" }, { medication: "Metformin" }],
    )
    expect(alerts).toHaveLength(2)
  })
})
