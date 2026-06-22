/**
 * Pure clinical-safety helpers. The deterministic allergy name-match is the
 * guaranteed layer behind the AI safety check (lib/actions/ai.ts) — a prescribed
 * drug whose name contains (or is contained by) a documented allergy substance.
 * Dependency-free for unit testing.
 */
export interface SafetyAlert {
  severity: "high" | "medium" | "low"
  category: "allergy" | "interaction" | "contraindication" | "dosing" | "duplicate" | "other"
  medication: string | null
  message: string
}

/** Flag prescriptions whose name matches a documented allergy (always caught). */
export function matchAllergyAlerts(
  allergies: string[],
  prescriptions: { medication: string }[],
): SafetyAlert[] {
  const out: SafetyAlert[] = []
  for (const p of prescriptions) {
    const medL = p.medication.toLowerCase().trim()
    if (medL.length <= 2) continue
    for (const a of allergies) {
      const aL = a.toLowerCase().trim()
      if (aL.length > 2 && (medL.includes(aL) || aL.includes(medL))) {
        out.push({
          severity: "high",
          category: "allergy",
          medication: p.medication,
          message: `Documented allergy to ${a} — "${p.medication}" appears to match. Verify before prescribing.`,
        })
      }
    }
  }
  return out
}
