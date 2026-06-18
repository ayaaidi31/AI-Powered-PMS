import React from "react"

// Drop dangling emphasis markers so unmatched bold markers never render literally.
const stripMarkers = (s: string) => s.replace(/\*\*|__/g, "")

/** Render inline emphasis: **bold** / __bold__ and *italic*. */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*/g
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(stripMarkers(text.slice(last, m.index)))
    if (m[1] != null) nodes.push(<strong key={`${keyBase}-b${i}`}>{m[1]}</strong>)
    else if (m[2] != null) nodes.push(<strong key={`${keyBase}-s${i}`}>{m[2]}</strong>)
    else if (m[3] != null) nodes.push(<em key={`${keyBase}-i${i}`}>{m[3]}</em>)
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) nodes.push(stripMarkers(text.slice(last)))
  return nodes
}

/** Split a Markdown table row "| a | b |" into trimmed cells. */
function parseRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
}

/** True for a Markdown table separator row like "|---|:--:|". */
function isSeparatorRow(line: string): boolean {
  if (!line.includes("-")) return false
  const cells = parseRow(line)
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c))
}

/**
 * Renders a clinical report that uses light Markdown (bold section headings,
 * bullet lists, GitHub-style tables) as clean, professional content — so model
 * output such as "**Anamnese:**" or a "| col | col |" table appears properly
 * instead of literal asterisks/pipes. Plain text is rendered as paragraphs.
 */
export function ReportContent({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n")
  const blocks: React.ReactNode[] = []
  let list: string[] = []

  const flush = (key: string) => {
    if (list.length === 0) return
    const items = list
    list = []
    blocks.push(
      <ul key={`ul-${key}`} className="list-disc pl-5 space-y-1">
        {items.map((it, j) => <li key={j}>{renderInline(it, `li-${key}-${j}`)}</li>)}
      </ul>,
    )
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()

    // Table: a row of "| … |" immediately followed by a separator row.
    if (line.includes("|") && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      flush(String(i))
      const header = parseRow(line)
      const start = i
      i += 2 // consume header + separator
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().includes("|") && lines[i].trim() !== "") {
        rows.push(parseRow(lines[i].trim()))
        i++
      }
      blocks.push(
        <div key={`tbl-${start}`} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {header.map((h, k) => (
                  <th key={k} className="border border-border bg-muted/50 px-2.5 py-1.5 text-left font-semibold align-top">
                    {renderInline(h, `th-${start}-${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {header.map((_, ci) => (
                    <td key={ci} className="border border-border px-2.5 py-1.5 align-top">
                      {renderInline(r[ci] ?? "", `td-${start}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (!line) { flush(String(i)); i++; continue }
    // Bullet list item
    if (/^[-*•]\s+/.test(line)) { list.push(line.replace(/^[-*•]\s+/, "")); i++; continue }
    flush(String(i))
    // A whole-line bold (e.g. "**Anamnese:**") or "# Heading" → section heading
    const heading = line.match(/^\*\*(.+?)\*\*:?\s*$/) ?? line.match(/^#{1,4}\s+(.*)$/)
    if (heading) {
      blocks.push(<h4 key={i} className="font-semibold text-foreground mt-4 first:mt-0">{heading[1]}</h4>)
      i++
      continue
    }
    blocks.push(<p key={i} className="leading-relaxed">{renderInline(line, `p-${i}`)}</p>)
    i++
  }
  flush("end")

  return <div className={`space-y-2 text-sm text-foreground ${className ?? ""}`}>{blocks}</div>
}
