/**
 * Pure helpers for the light-Markdown renderer (components/report-content.tsx).
 * Kept dependency-free so they can be unit-tested in isolation.
 */

/** Drop dangling emphasis markers so unmatched bold markers never render literally. */
export const stripMarkers = (s: string): string => s.replace(/\*\*|__/g, "")

/** Split a Markdown table row "| a | b |" into trimmed cells. */
export function parseRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
}

/** True for a Markdown table separator row like "|---|:--:|". */
export function isSeparatorRow(line: string): boolean {
  if (!line.includes("-")) return false
  const cells = parseRow(line)
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c))
}
