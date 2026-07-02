"use client"

/**
 * Patient-facing AI voice booking assistant (Feature 11). The patient is already
 * signed in, so the agent never asks who they are — it just helps them book,
 * reschedule, or cancel by talking.
 *
 * Loop: greet → listen (Web Speech STT) → think (LLM) → speak (TTS) → on a
 * confirmed request, commit to the database → speak the outcome. A text box is
 * always available as a fallback when the mic isn't usable.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Phone, PhoneOff, Mic, Loader2, Bot, User, Send, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  voiceAgentReply,
  executeVoiceAction,
  type VoiceMsg,
  type VoiceLang,
  type VoiceReply,
} from "@/lib/actions/voice"

type Status = "idle" | "thinking" | "speaking" | "listening" | "ended"
interface Bubble { role: "assistant" | "user"; text: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSR = () =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null

/** Pick the most natural-sounding installed voice for the language. */
function pickVoice(voices: SpeechSynthesisVoice[], lang: VoiceLang): SpeechSynthesisVoice | null {
  const want = lang === "de" ? "de" : "en"
  const pool = voices.filter((v) => v.lang.toLowerCase().startsWith(want))
  if (pool.length === 0) return null
  // Neural / online voices first — they sound markedly more human than the
  // built-in robotic eSpeak fallback.
  const prefer = [/natural/i, /neural/i, /google/i, /premium/i, /online/i, /wavenet/i]
  for (const re of prefer) {
    const m = pool.find((v) => re.test(v.name))
    if (m) return m
  }
  // A couple of known-good local voices by name.
  const named = pool.find((v) => /(Katja|Conrad|Anna|Markus|Petra|Hedda|Aria|Jenny|Guy|Sonia|Libby)/i.test(v.name))
  return named ?? pool.find((v) => !/espeak/i.test(v.name)) ?? pool[0]
}

export function VoiceBookingClient({ patientFirstName }: { patientFirstName: string }) {
  const [status, setStatus] = useState<Status>("idle")
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [interim, setInterim] = useState("")
  const [lang, setLang] = useState<VoiceLang>("de")
  const [textInput, setTextInput] = useState("")
  const [sttSupported, setSttSupported] = useState(true)

  const messagesRef = useRef<VoiceMsg[]>([])
  const activeRef = useRef(false)
  const langRef = useRef<VoiceLang>(lang)
  langRef.current = lang
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null)
  const resolveListenRef = useRef<((t: string) => void) | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    setSttSupported(Boolean(getSR()))
    if (typeof window === "undefined" || !window.speechSynthesis) return
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices() }
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => { window.speechSynthesis.onvoiceschanged = null }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [bubbles, interim])

  const pushAssistant = (text: string) => {
    messagesRef.current = [...messagesRef.current, { role: "assistant", content: text }]
    setBubbles((b) => [...b, { role: "assistant", text }])
  }
  const pushUser = (text: string) => {
    messagesRef.current = [...messagesRef.current, { role: "user", content: text }]
    setBubbles((b) => [...b, { role: "user", text }])
  }

  const speak = useCallback((text: string) =>
    new Promise<void>((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return resolve()
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      const v = pickVoice(voicesRef.current, langRef.current)
      if (v) u.voice = v
      u.lang = langRef.current === "de" ? "de-DE" : "en-US"
      u.rate = 1.0
      u.pitch = 1.05
      u.onend = () => resolve()
      u.onerror = () => resolve()
      window.speechSynthesis.speak(u)
    }), [])

  const listen = useCallback(() =>
    new Promise<string>((resolve) => {
      resolveListenRef.current = resolve
      const SR = getSR()
      if (!SR) return // rely on the text box
      const r = new SR()
      recogRef.current = r
      r.lang = langRef.current === "de" ? "de-DE" : "en-US"
      r.continuous = false
      r.interimResults = true
      let finalText = ""
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (e: any) => {
        let live = ""
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) finalText += t + " "
          else live += t
        }
        setInterim(live)
      }
      r.onerror = () => {}
      r.onend = () => {
        recogRef.current = null
        setInterim("")
        if (resolveListenRef.current) {
          resolveListenRef.current = null
          resolve(finalText.trim())
        }
      }
      try { r.start() } catch { /* already started */ }
    }), [])

  const agentTurn = useCallback(async (reply: VoiceReply) => {
    if (reply.say) {
      pushAssistant(reply.say)
      setStatus("speaking")
      await speak(reply.say)
    }
    if (reply.action) {
      setStatus("thinking")
      let outcome: string
      try {
        const ex = await executeVoiceAction(reply.action, langRef.current)
        outcome = ex.status === "ok" ? ex.data.say : ex.message
      } catch {
        outcome = langRef.current === "de"
          ? "Es gab gerade ein technisches Problem. Können wir es noch einmal versuchen?"
          : "Something went wrong on our side just now. Shall we try that again?"
      }
      pushAssistant(outcome)
      setStatus("speaking")
      await speak(outcome)
    }
  }, [speak])

  const endCall = useCallback(() => {
    activeRef.current = false
    try { recogRef.current?.stop() } catch { /* ignore */ }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel()
    if (resolveListenRef.current) {
      const r = resolveListenRef.current
      resolveListenRef.current = null
      r("")
    }
    setInterim("")
    setStatus("ended")
  }, [])

  // Call the agent, never throwing: a rejected server action becomes a spoken apology.
  const safeReply = useCallback(async (msgs: VoiceMsg[]) => {
    try {
      return await voiceAgentReply(msgs, langRef.current)
    } catch {
      return {
        status: "error" as const,
        message: langRef.current === "de"
          ? "Verbindung zum Assistenten unterbrochen. Bitte versuchen Sie es erneut."
          : "Lost the connection to the assistant. Please try again.",
      }
    }
  }, [])

  const startCall = useCallback(async () => {
    setBubbles([])
    messagesRef.current = []
    activeRef.current = true
    setStatus("thinking")
    // Warm up the speech engine on the user gesture (some browsers need this).
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }

    const greeting = await safeReply([])
    if (greeting.status !== "ok") {
      pushAssistant(greeting.message)
      setStatus("ended")
      activeRef.current = false
      return
    }
    await agentTurn(greeting.data)

    while (activeRef.current) {
      setStatus("listening")
      const said = await listen()
      if (!activeRef.current) break
      if (!said.trim()) continue
      pushUser(said)
      setStatus("thinking")
      const reply = await safeReply(messagesRef.current)
      if (!activeRef.current) break
      if (reply.status !== "ok") {
        pushAssistant(reply.message)
        setStatus("speaking")
        await speak(reply.message)
        continue
      }
      await agentTurn(reply.data)
    }
  }, [agentTurn, listen, speak, safeReply])

  const submitText = (e: React.FormEvent) => {
    e.preventDefault()
    const t = textInput.trim()
    if (!t) return
    setTextInput("")
    try { recogRef.current?.stop() } catch { /* ignore */ }
    if (resolveListenRef.current) {
      const r = resolveListenRef.current
      resolveListenRef.current = null
      r(t)
    }
  }

  const inCall = status !== "idle" && status !== "ended"
  const statusLabel =
    status === "listening" ? (lang === "de" ? "Ich höre zu…" : "Listening…")
    : status === "thinking" ? (lang === "de" ? "Einen Moment…" : "One moment…")
    : status === "speaking" ? (lang === "de" ? "Spricht…" : "Speaking…")
    : ""

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden max-w-xl mx-auto w-full">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className={`relative flex items-center justify-center w-10 h-10 rounded-full ${inCall ? "bg-primary/10" : "bg-muted"}`}>
          {status === "listening" && <span className="absolute inline-flex h-full w-full rounded-full bg-primary/30 animate-ping" />}
          {status === "thinking" ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
            : status === "speaking" ? <Volume2 className="w-5 h-5 text-primary" />
            : status === "listening" ? <Mic className="w-5 h-5 text-primary" />
            : <Bot className="w-5 h-5 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">
            {status === "idle" ? (lang === "de" ? "KI-Terminassistent" : "AI appointment assistant")
              : status === "ended" ? (lang === "de" ? "Gespräch beendet" : "Conversation ended")
              : statusLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            {lang === "de" ? "Termin buchen · verschieben · absagen" : "Book · reschedule · cancel"}
          </p>
        </div>
        {!inCall && (
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            {(["de", "en"] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)}
                className={`px-2.5 py-1 transition-colors ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        {inCall && (
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={endCall}>
            <PhoneOff className="w-4 h-4" /> {lang === "de" ? "Beenden" : "End"}
          </Button>
        )}
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="h-[22rem] overflow-y-auto px-5 py-4 space-y-3">
        {bubbles.length === 0 && status === "idle" && (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-3">
            <Phone className="w-10 h-10 opacity-40" />
            <p className="max-w-xs text-sm">
              {lang === "de"
                ? `Hallo ${patientFirstName}! Starten Sie das Gespräch und sagen Sie einfach, ob Sie einen Termin buchen, verschieben oder absagen möchten.`
                : `Hi ${patientFirstName}! Start the conversation and just say whether you'd like to book, reschedule, or cancel an appointment.`}
            </p>
          </div>
        )}
        {bubbles.map((b, i) => (
          <div key={i} className={`flex gap-2.5 ${b.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${b.role === "assistant" ? "bg-primary/10 text-primary" : "bg-muted text-foreground"}`}>
              {b.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${b.role === "assistant" ? "bg-muted text-foreground rounded-tl-sm" : "bg-primary text-primary-foreground rounded-tr-sm"}`}>
              {b.text}
            </div>
          </div>
        ))}
        {interim && (
          <div className="flex gap-2.5 flex-row-reverse opacity-60">
            <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-muted text-foreground">
              <User className="w-4 h-4" />
            </div>
            <div className="max-w-[78%] rounded-2xl px-3.5 py-2 text-sm bg-primary/70 text-primary-foreground rounded-tr-sm italic">{interim}</div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-5 py-4 border-t border-border space-y-3">
        {status === "idle" || status === "ended" ? (
          <Button className="w-full gap-2" size="lg" onClick={startCall}>
            <Phone className="w-4 h-4" /> {status === "ended" ? (lang === "de" ? "Neues Gespräch" : "New conversation") : (lang === "de" ? "Gespräch starten" : "Start conversation")}
          </Button>
        ) : (
          <form onSubmit={submitText} className="flex items-center gap-2">
            <Input value={textInput} onChange={(e) => setTextInput(e.target.value)}
              placeholder={sttSupported ? (lang === "de" ? "Sprechen Sie – oder tippen Sie hier…" : "Speak — or type here…") : (lang === "de" ? "Tippen Sie Ihre Nachricht…" : "Type your message…")}
              className="flex-1" />
            <Button type="submit" size="icon" variant="outline" disabled={!textInput.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        )}
        {!sttSupported && inCall && (
          <p className="text-xs text-amber-600">
            {lang === "de" ? "Spracherkennung wird in diesem Browser nicht unterstützt — bitte tippen. (Chrome empfohlen.)" : "Speech recognition isn't supported here — please type. (Chrome recommended.)"}
          </p>
        )}
      </div>
    </div>
  )
}
