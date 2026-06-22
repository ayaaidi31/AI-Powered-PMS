import { describe, it, expect } from "vitest"
import { codePriceCents, GOAE_PUNKTWERT_CENTS, EBM_ORIENTIERUNGSWERT_CENTS } from "@/lib/billing-values"

describe("codePriceCents", () => {
  it("returns null when the code has no points", () => {
    expect(codePriceCents({ catalog: "GOAE", points: null, multiplier: 2.3 })).toBeNull()
  })

  it("computes GOÄ = points × Punktwert × Steigerungssatz", () => {
    const expected = Math.round(100 * GOAE_PUNKTWERT_CENTS * 2.3)
    expect(codePriceCents({ catalog: "GOAE", points: 100, multiplier: 2.3 })).toBe(expected)
  })

  it("defaults the GOÄ multiplier to 1 when null", () => {
    const expected = Math.round(100 * GOAE_PUNKTWERT_CENTS)
    expect(codePriceCents({ catalog: "GOAE", points: 100, multiplier: null })).toBe(expected)
  })

  it("computes EBM = points × Orientierungswert and ignores the multiplier", () => {
    const expected = Math.round(200 * EBM_ORIENTIERUNGSWERT_CENTS)
    expect(codePriceCents({ catalog: "EBM", points: 200, multiplier: 5 })).toBe(expected)
  })

  it("rounds to whole cents", () => {
    const v = codePriceCents({ catalog: "EBM", points: 1, multiplier: null })
    expect(Number.isInteger(v)).toBe(true)
  })
})
