/**
 * Monetary conversion for billing codes (Feature 12). Pure + dependency-free.
 *
 * GOÄ (private)  = points × Punktwert × Steigerungssatz → the invoiced amount.
 * EBM (statutory) = points × Orientierungswert → the value the KV settles
 *   (GKV patients are not invoiced; informational for the doctor).
 */
export const GOAE_PUNKTWERT_CENTS = 5.82873 // GOÄ Punktwert (fixed since 1996)
export const EBM_ORIENTIERUNGSWERT_CENTS = 11.9339 // EBM 2024 Orientierungswert

export interface PricedCode {
  catalog: "EBM" | "GOAE"
  points: number | null
  multiplier: number | null // GOÄ Steigerungssatz; null/ignored for EBM
}

/** Monetary value of a code in cents, or null when the code has no point value. */
export function codePriceCents(c: PricedCode): number | null {
  if (c.points == null) return null
  if (c.catalog === "GOAE") return Math.round(c.points * GOAE_PUNKTWERT_CENTS * (c.multiplier ?? 1))
  return Math.round(c.points * EBM_ORIENTIERUNGSWERT_CENTS)
}
