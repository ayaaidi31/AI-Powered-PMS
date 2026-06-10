import React from "react"

/** Render inline emphasis: **bold** / __bold__ and *italic*. */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*/g
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] != null) nodes.push(<strong key={`${keyBase}-b${i}`}>{m[1]}</strong>)
    else if (m[2] != null) nodes.push(<strong key={`${keyBase}-s${i}`}>{m[2]}</strong>)
    else if (m[3] != null) nodes.push(<em key={`${keyBase}-i${i}`}>{m[3]}</em>)
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/**
 * Renders a clinical report that uses light Markdown (bold section headings,
 * bullet lists) as clean, professional content — so model output such as
 * "**Anamnese:**" appears as a real heading instead of literal asterisks.
 * Plain text without any Markdown is rendered unchanged as paragraphs.
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

  lines.forEach((raw, idx) => {
    const line = raw.trim()
    if (!line) { flush(String(idx)); return }
    // Bullet list item
    if (/^[-*•]\s+/.test(line)) { list.push(line.replace(/^[-*•]\s+/, "")); return }
    flush(String(idx))
    // A whole-line bold (e.g. "**Anamnese:**") or "# Heading" → section heading
    const heading = line.match(/^\*\*(.+?)\*\*:?$/) ?? line.match(/^#{1,4}\s+(.*)$/)
    if (heading) {
      blocks.push(
        <h4 key={idx} className="font-semibold text-foreground mt-4 first:mt-0">{heading[1]}</h4>,
      )
      return
    }
    blocks.push(<p key={idx} className="leading-relaxed">{renderInline(line, `p-${idx}`)}</p>)
  })
  flush("end")

  return <div className={`space-y-2 text-sm text-foreground ${className ?? ""}`}>{blocks}</div>
}
