"use client"

/**
 * Doctor on-demand Q&A over the patient's own records (Feature 17). Conversational
 * RAG via `askPatientRecordsQA`, sandboxed to the active patient, with cited source
 * reports. Conversation is owned by the parent so it survives closing the dialog.
 */
import { useState, useRef, useEffect, useTransition } from "react"
import { Send, FileSearch, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { askPatientRecordsQA, type RecordSource } from "@/lib/actions/ai"
import { ReportContent } from "@/components/report-content"
import { useT } from "@/lib/i18n/locale-context"

export interface RecordsQAMessage {
  role: "user" | "assistant"
  content: string
  sources?: RecordSource[]
  grounded?: boolean
}

export function RecordsQA({
  patientId, patientName, messages, setMessages, lang,
}: {
  patientId: string
  patientName: string
  messages: RecordsQAMessage[]
  setMessages: (updater: (prev: RecordsQAMessage[]) => RecordsQAMessage[]) => void
  /** Language the AI should answer in, chosen at the workspace. */
  lang?: "de" | "en"
}) {
  const t = useT()
  const suggestions = [t("aiChat.recordsSuggestion1"), t("aiChat.recordsSuggestion2"), t("aiChat.recordsSuggestion3")]
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
      const r = await askPatientRecordsQA({ patientId, question: q, history, lang })
      if (r.status === "ok") {
        setMessages((m) => [...m, { role: "assistant", content: r.data.answer, sources: r.data.sources, grounded: r.data.grounded }])
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
              {t("aiChat.recordsIntroBefore")}<span className="font-medium text-foreground">{patientName}</span>{t("aiChat.recordsIntroAfter")}
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
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
                  <div className="[&_p]:my-1 [&_h4]:text-sm [&_h4]:font-semibold [&_ul]:my-1 [&_li]:my-0.5">
                    <ReportContent text={m.content} />
                  </div>
                  {m.sources && m.sources.length > 0 && m.grounded !== false && (
                    <div className="mt-2 pt-2 border-t border-border/60 space-y-0.5">
                      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <BookOpen className="w-3 h-3" /> {t("aiChat.sources")}
                      </p>
                      {m.sources.map((s) => (
                        <p key={s.id} className="text-[11px] text-muted-foreground">{s.label}</p>
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
        <FileSearch className="w-3 h-3 shrink-0" /> {t("aiChat.recordsDisclaimer")}
      </p>
      <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="flex gap-2 pt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("aiChat.recordsPlaceholder")}
          className="flex-1 px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" size="icon" disabled={pending || !input.trim()} aria-label={t("aiChat.send")}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  )
}
