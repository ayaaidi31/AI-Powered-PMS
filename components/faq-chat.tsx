"use client"

/**
 * Patient-facing clinic FAQ assistant (Feature 16). A floating chat widget that
 * answers questions about the practice via the Mistral-backed `askClinicFaq`
 * action (grounded in CLINIC_FAQ). General info only — not medical advice.
 */
import { useState, useRef, useEffect, useTransition } from "react"
import { MessageCircle, X, Send, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { askClinicFaq } from "@/lib/actions/ai"
import { ReportContent } from "@/components/report-content"

interface Msg {
  role: "user" | "assistant"
  content: string
}

const SUGGESTIONS = [
  "What are your opening hours?",
  "How do I cancel an appointment?",
  "Do you accept private insurance?",
  "Where can I park?",
]

export function FaqChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [isPending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, isPending])

  function send(text: string) {
    const q = text.trim()
    if (!q || isPending) return
    const history = messages
    setMessages((m) => [...m, { role: "user", content: q }])
    setInput("")
    startTransition(async () => {
      const result = await askClinicFaq(q, history)
      const reply = result.status === "ok" ? result.data.answer : result.message
      setMessages((m) => [...m, { role: "assistant", content: reply }])
    })
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div
          className="mb-4 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl w-[calc(100vw-3rem)] sm:w-96"
          style={{ maxHeight: "min(70vh, 34rem)" }}
        >
          {/* Header */}
          <div className="p-4 border-b border-border bg-primary text-primary-foreground">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <MessageCircle className="w-4 h-4" /> Clinic Assistant
              </h3>
              <button onClick={() => setOpen(false)} className="opacity-80 hover:opacity-100" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs opacity-90 mt-1">Hours, appointments, insurance, directions…</p>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Hi! I can answer questions about the clinic. Try:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs px-2.5 py-1.5 rounded-full border border-border hover:bg-accent text-foreground"
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
                  className={`rounded-2xl px-3.5 py-2 max-w-[85%] text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="[&_p]:my-1 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-2 [&_ul]:my-1 [&_li]:my-0.5">
                      <ReportContent text={m.content} />
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}

            {isPending && (
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

          {/* Disclaimer + input */}
          <div className="border-t border-border bg-card">
            <p className="px-3 pt-2 text-[10px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3 shrink-0" /> AI assistant — general clinic info only, not medical advice.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="p-3 pt-2 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your question…"
                className="flex-1 px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button type="submit" size="icon" disabled={isPending || !input.trim()} aria-label="Send">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      )}

      <Button onClick={() => setOpen(!open)} className="rounded-full w-14 h-14 shadow-lg">
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        <span className="sr-only">Open clinic assistant</span>
      </Button>
    </div>
  )
}
