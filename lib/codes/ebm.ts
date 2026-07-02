/**
 * lib/codes/ebm.ts — file-based EBM catalog (no database).
 *
 * The full official KBV EBM catalog (~4,600 codes) is read directly from the
 * downloaded CSV at runtime and cached in memory, so it never needs to occupy
 * cloud database space. Server-only (uses the filesystem); import it from
 * Server Components / Server Actions, never from client code.
 *
 * Source file: data/codes/20220323_ebm_csv_datei.csv (KBV "EBM CSV Datei")
 *   - ISO-8859-1 (Latin-1) encoded, semicolon-delimited, quoted values
 *   - Columns: EBM-Ziffer; EBM_Bezeichnung; Punktzahl; EBM_Betrag; Waehrung;
 *              Zusatzkennzeichen; gueltigab; gueltigbis; geaendert
 *   - The file is a historical snapshot (validity periods back to 2013), so
 *     only the most recent version of each code is kept (latest `gueltigab`).
 */
import "server-only"
import { readFileSync } from "node:fs"
import { join } from "node:path"

export interface EbmCode {
  code: string            // EBM-Ziffer, e.g. "03000"
  description: string     // EBM_Bezeichnung
  points: number          // Punktzahl (the EBM is point-valued)
  amountCents: number     // EBM_Betrag in cents (0 for most — priced regionally)
  validFrom: string       // gueltigab (YYYYMMDD)
  validTo: string         // gueltigbis (YYYYMMDD; 99991231 = open-ended)
}

const FILE = "20220323_ebm_csv_datei.csv"

// Loaded once, then reused across requests.
let cache: Map<string, EbmCode> | null = null

/** Parse a German-formatted Euro amount ("1,6") into integer cents. */
function amountToCents(raw: string): number {
  const v = raw.replace(",", ".").trim()
  if (!v) return 0
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function stripQuotes(s: string): string {
  return s.replace(/^"|"$/g, "").trim()
}

function load(): Map<string, EbmCode> {
  if (cache) return cache
  const path = join(process.cwd(), "data", "codes", FILE)
  const text = readFileSync(path, "latin1") // KBV file is ISO-8859-1
  const map = new Map<string, EbmCode>()

  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue
    const c = line.split(";").map(stripQuotes)
    const code = c[0]
    if (!code) continue

    const entry: EbmCode = {
      code,
      description: c[1] ?? "",
      points: Number.parseInt(c[2] || "0", 10) || 0,
      amountCents: amountToCents(c[3] ?? ""),
      validFrom: c[6] ?? "",
      validTo: c[7] ?? "",
    }
    // Keep the most recent version of each code.
    const existing = map.get(code)
    if (!existing || entry.validFrom > existing.validFrom) map.set(code, entry)
  }

  cache = map
  return map
}

/** Look up a single EBM code (exact match). */
export function getEbmCode(code: string): EbmCode | null {
  return load().get(code.trim()) ?? null
}

/** Free-text / code search over the catalog (for the doctor's billing picker). */
export function searchEbmCodes(query: string, limit = 25): EbmCode[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: EbmCode[] = []
  for (const e of load().values()) {
    if (e.code.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)) {
      out.push(e)
      if (out.length >= limit) break
    }
  }
  return out
}

/** Total number of distinct codes available. */
export function ebmCount(): number {
  return load().size
}
