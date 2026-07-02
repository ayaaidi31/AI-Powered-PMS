"use client"

/**
 * Clinical decision-support panel (Feature 13). A guideline-grounded Q&A for the
 * doctor: questions go to `askDecisionSupport`, which retrieves chunks from the
 * BGE pgvector store and answers via Mistral with [n] citations. The current
 * consultation notes + working diagnosis are sent along as context. Support
 * only — not a clinical decision.
 */
import { useState, useRef, useEffect, useTransition } from "react"
import { Sparkles, Send, BookOpen, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { askDecisionSupport, type DecisionSource, type PatientContext } from "@/lib/actions/ai"
import { ReportContent } from "@/components/report-content"

export interface DsMessage {
  role: "user" | "assistant"
  content: string
  sources?: DecisionSource[]
  via?: string
  grounded?: boolean
}

const SUGGESTIONS = [
  "Welche leitliniengerechte Therapie wird empfohlen?",
  "Welche Red Flags muss ich ausschließen?",
  "Welche Diagnostik ist indiziert?",
]

export function DecisionSupport({
  notes, diagnosis, patient, messages, setMessages,
}: {
  notes: string
  diagnosis: string
  patient: PatientContext
  // Conversation is owned by the parent so it survives closing the dialog and
  // persists for the duration of the consultation.
  messages: DsMessage[]
  setMessages: (updater: (prev: DsMessage[]) => DsMessage[]) => void
}) {
  const [input, setInput] = useState("")
  const [pending, start] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, pending])

  function send(text: string) {
    const q = text.trim()
    if (!q || pending) return
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((m) => [...m, { role: "user", content: q }])
    setInput("")
    start(async () => {
      const r = await askDecisionSupport({ question: q, notes, diagnosis, patient, history })
      if (r.status === "ok") {
        setMessages((m) => [...m, { role: "assistant", content: r.data.answer, sources: r.data.sources, via: r.data.via, grounded: r.data.grounded }])
      } else {
        setMessages((m) => [...m, { role: "assistant", content: r.message }])
      }
    })
  }

  return (
    <div className="flex flex-col h-[60vh]">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask a guideline question about this case. Answers are grounded in the AWMF guideline
              knowledge base and cite their sources.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-2.5 py-1.5 rounded-full border border-border hover:bg-accent text-foreground text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`rounded-2xl px-3.5 py-2 max-w-[88%] text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm"
              }`}
            >
              {m.role === "assistant" ? (
                <>
                  {m.grounded === false && (
                    <p className="text-xs text-amber-600 dark:text-amber-500 flex items-center gap-1 mb-1">
                      <AlertTriangle className="w-3 h-3" /> No matching guideline excerpts found.
                    </p>
                  )}
                  <div className="[&_p]:my-1 [&_h4]:text-sm [&_h4]:font-semibold [&_ul]:my-1 [&_li]:my-0.5">
                    <ReportContent text={m.content} />
                  </div>
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <BookOpen className="w-3 h-3" /> Sources {m.via === "text" && <Badge variant="outline" className="text-[9px] px-1 py-0">keyword</Badge>}
                      </p>
                      {m.sources.map((s, j) => (
                        <div key={j} className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            [{j + 1}] {s.title ?? "Leitlinie"}{s.page ? `, S. ${s.page}` : ""}
                          </span>
                          {s.snippet && <span className="block italic opacity-80">„{s.snippet}…"</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm px-3.5 py-2 bg-muted text-muted-foreground text-sm">
              <span className="inline-flex gap-1">
                <span className="animate-bounce">•</span>
                <span className="animate-bounce [animation-delay:150ms]">•</span>
                <span className="animate-bounce [animation-delay:300ms]">•</span>
              </span>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground flex items-center gap-1 pt-2">
        <Sparkles className="w-3 h-3 shrink-0" /> Guideline-grounded support — informational, not a clinical decision.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex gap-2 pt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a clinical guideline question…"
          className="flex-1 px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" size="icon" disabled={pending || !input.trim()} aria-label="Ask">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  )
}
