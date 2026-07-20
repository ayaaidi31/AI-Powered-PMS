import { describe, it, expect } from "vitest"
import { matchAllergyAlerts } from "@/lib/clinical-safety"
import { en } from "@/lib/i18n/messages/en"
import { translate, type TFunction } from "@/lib/i18n/translate"

// A real English translator, so the message assertions check the resolved text.
const t: TFunction = (key, vars) => translate(en, key, vars)
const match = (allergies: string[], prescriptions: { medication: string }[]) =>
  matchAllergyAlerts(allergies, prescriptions, t)

describe("matchAllergyAlerts", () => {
  it("flags an exact-name allergy match", () => {
    const alerts = match(["Penicillin"], [{ medication: "Penicillin V" }])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe("high")
    expect(alerts[0].category).toBe("allergy")
    expect(alerts[0].medication).toBe("Penicillin V")
    expect(alerts[0].message).toContain("Penicillin")
  })

  it("is case-insensitive", () => {
    expect(match(["penicillin"], [{ medication: "PENICILLIN" }])).toHaveLength(1)
  })

  it("returns nothing for an unrelated drug", () => {
    expect(match(["Penicillin"], [{ medication: "Ibuprofen" }])).toHaveLength(0)
  })

  it("does not match when the drug name is class-level only (handled by the AI layer)", () => {
    // Amoxicillin is a penicillin but the string doesn't contain "penicillin".
    expect(match(["Penicillin"], [{ medication: "Amoxicillin" }])).toHaveLength(0)
  })

  it("ignores too-short tokens to avoid false positives", () => {
    expect(match(["ab"], [{ medication: "ab" }])).toHaveLength(0)
  })

  it("flags every matching prescription across multiple allergies", () => {
    const alerts = match(
      ["Penicillin", "Aspirin"],
      [{ medication: "Penicillin G" }, { medication: "Aspirin 100" }, { medication: "Metformin" }],
    )
    expect(alerts).toHaveLength(2)
  })
})
