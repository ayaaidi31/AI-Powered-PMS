"use server"

/**
 * Billing-code lookup for the Doctor's manual code entry (Feature 14).
 *
 * This is the temporary manual path — the AI suggestion layer (RAG) will plug
 * in here later. Statutory (GKV) patients are coded with EBM (read from the
 * file-based catalog), private/self-pay (PKV/Selbstzahler) with GOÄ (from the
 * goae_catalog table).
 */
import { sql } from "@/lib/db"
import { searchEbmCodes } from "@/lib/codes/ebm"
import { ok, type ActionResult } from "./types"

export interface CodeSuggestion {
  catalog: "EBM" | "GOAE"
  code: string
  description: string
  points: number | null
  defaultMultiplier: number | null // GOÄ Steigerungssatz; null for EBM
}

// GOÄ point value (Punktwert) in cents — fixed since 1996.
const GOAE_PUNKTWERT_CENTS = 5.82873

/** Search the appropriate catalog for codes matching `query` (code or text). */
export async function searchBillingCodes(
  catalog: "EBM" | "GOAE",
  query: string,
): Promise<ActionResult<CodeSuggestion[]>> {
  const q = query.trim()
  if (q.length < 2) return ok([])

  if (catalog === "EBM") {
    const results = searchEbmCodes(q, 15).map((e) => ({
      catalog: "EBM" as const,
      code: e.code,
      description: e.description,
      points: e.points,
      defaultMultiplier: null,
    }))
    return ok(results)
  }

  const rows = await sql<{ code: string; description: string; base_cents: number; default_multiplier: string }>`
    SELECT code, description, base_cents, default_multiplier
    FROM goae_catalog
    WHERE code ILIKE ${"%" + q + "%"} OR description ILIKE ${"%" + q + "%"}
    ORDER BY code
    LIMIT 15`
  return ok(
    rows.map((r) => ({
      catalog: "GOAE" as const,
      code: r.code,
      description: r.description,
      points: Math.round(r.base_cents / GOAE_PUNKTWERT_CENTS),
      defaultMultiplier: Number(r.default_multiplier),
    })),
  )
}
