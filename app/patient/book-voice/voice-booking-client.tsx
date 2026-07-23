"use client"

/**
 * Patient-facing AI voice booking assistant (Feature 11). The patient is already
 * signed in, so the agent never asks who they are and only handles booking,
 * rescheduling, or cancellation by voice.
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
  type VoiceAction,
} from "@/lib/actions/voice"
import { useT, useLocale } from "@/lib/i18n/locale-context"

type Status = "idle" | "thinking" | "speaking" | "listening" | "ended"
interface Bubble { role: "assistant" | "user"; text: string }

/** Format a local YYYY-MM-DDTHH:mm stamp for the spoken confirmation. */
const fmtLocal = (dt: string, lang: VoiceLang) => {
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return dt
  return d.toLocaleString(lang === "de" ? "de-DE" : "en-GB", {
    weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  })
}

/**
 * The single confirmation the patient hears before anything is written. Built on
 * the client from the action the model proposed, so a booking can never happen
 * without an explicit spoken "yes" — regardless of what the model claims.
 */
function confirmText(a: VoiceAction, lang: VoiceLang): string {
  const de = lang === "de"
  const suffix = de ? " Soll ich das durchführen? Bitte sagen Sie ja oder nein." : " Shall I go ahead? Please say yes or no."
  if (a.type === "cancel") {
    const when = a.target_datetime ? fmtLocal(a.target_datetime, lang) : ""
    return (de ? `Ich storniere Ihren Termin${when ? ` am ${when}` : ""}.` : `I'll cancel your appointment${when ? ` on ${when}` : ""}.`) + suffix
  }
  const when = a.datetime ? fmtLocal(a.datetime, lang) : ""
  if (a.type === "reschedule") {
    return (de ? `Ich verschiebe Ihren Termin auf ${when}.` : `I'll move your appointment to ${when}.`) + suffix
  }
  const doc = a.doctor_name?.trim() ? ` ${de ? "bei" : "with"} Dr. ${a.doctor_name.replace(/^dr\.?\s*/i, "")}` : ""
  if (a.type === "change_doctor") {
    const toDoc = a.doctor_name?.trim()
      ? ` ${de ? "zu" : "to"} Dr. ${a.doctor_name.replace(/^dr\.?\s*/i, "")}`
      : (de ? " zu einer anderen Ärztin oder einem anderen Arzt" : " to a different doctor")
    const atWhen = when ? (de ? ` am ${when}` : ` on ${when}`) : ""
    return (de ? `Ich ändere Ihren Termin${toDoc}${atWhen}.` : `I'll change your appointment${toDoc}${atWhen}.`) + suffix
  }
  return (de ? `Ich buche einen Termin am ${when}${doc}.` : `I'll book an appointment on ${when}${doc}.`) + suffix
}

const isAffirmative = (t: string) =>
  /\b(yes|yeah|yep|yup|sure|correct|right|okay|ok|please|confirm|go ahead|do it|ja|jawohl|genau|richtig|bitte|stimmt|passt)\b/i.test(t)
const isNegative = (t: string) =>
  /\b(no|nope|nah|don'?t|do not|stop|nicht|nein|falsch|abbrechen)\b/i.test(t)

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
  const t = useT()
  // The voice conversation (speech recognition, spoken voice, and the AI's replies)
  // follows the patient's chosen interface language — one language, no mismatch.
  const lang = useLocale() as VoiceLang
  const [status, setStatus] = useState<Status>("idle")
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [interim, setInterim] = useState("")
  const [textInput, setTextInput] = useState("")
  const [sttSupported, setSttSupported] = useState(true)

  const messagesRef = useRef<VoiceMsg[]>([])
  const activeRef = useRef(false)
  const langRef = useRef<VoiceLang>(lang)
  langRef.current = lang
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null)
  const resolveListenRef = useRef<((t: string) => void) | null>(null)
  // Whether the last listen actually picked up any speech (vs. pure silence), so
  // we only ask the patient to repeat when they spoke but weren't understood.
  const heardSpeechRef = useRef(false)
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
      heardSpeechRef.current = false
      let finalText = ""
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (e: any) => {
        heardSpeechRef.current = true
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

  // Speak a plain (no-action) reply.
  const sayReply = useCallback(async (text: string) => {
    if (!text) return
    pushAssistant(text)
    setStatus("speaking")
    await speak(text)
  }, [speak])

  // Commit a confirmed action and speak its real outcome.
  const execAction = useCallback(async (action: VoiceAction) => {
    setStatus("thinking")
    let outcome: string
    try {
      const ex = await executeVoiceAction(action, langRef.current)
      outcome = ex.status === "ok" ? ex.data.say : ex.message
    } catch {
      outcome = langRef.current === "de"
        ? "Es gab gerade ein technisches Problem. Können wir es noch einmal versuchen?"
        : "Something went wrong on our side just now. Shall we try that again?"
    }
    await sayReply(outcome)
  }, [sayReply])

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
    await sayReply(greeting.data.say)
    if (greeting.data.endCall) { endCall(); return }

    let repeatCount = 0 // consecutive turns where speech was heard but not understood
    let silenceCount = 0 // consecutive fully silent turns
    // When set, this text is processed as the next patient turn without listening
    // again — used when a confirmation answer is really a correction.
    let pending: string | null = null

    while (activeRef.current) {
      let said: string
      if (pending !== null) {
        said = pending
        pending = null
      } else {
        setStatus("listening")
        said = await listen()
        if (!activeRef.current) break
        if (!said.trim()) {
          if (heardSpeechRef.current) {
            // The patient spoke but it couldn't be transcribed — ask once or twice.
            repeatCount += 1
            silenceCount = 0
            if (repeatCount <= 2) {
              await sayReply(langRef.current === "de"
                ? "Entschuldigung, das habe ich nicht verstanden. Können Sie das bitte wiederholen?"
                : "Sorry, I didn't catch that. Could you please repeat?")
            }
          } else {
            // Pure silence — wait quietly and re-open the mic, without nagging.
            silenceCount += 1
            if (silenceCount >= 4) {
              await sayReply(langRef.current === "de"
                ? "Ich beende das Gespräch vorerst. Starten Sie es jederzeit neu, wenn Sie möchten."
                : "I'll end the call for now. Start it again anytime you like.")
              endCall()
              break
            }
          }
          continue
        }
      }
      repeatCount = 0
      silenceCount = 0
      pushUser(said)
      setStatus("thinking")
      const reply = await safeReply(messagesRef.current)
      if (!activeRef.current) break
      if (reply.status !== "ok") {
        await sayReply(reply.message)
        continue
      }

      if (reply.data.action) {
        // Never act on the model's word alone: read the details back and require
        // an explicit spoken "yes" before writing anything.
        await sayReply(confirmText(reply.data.action, langRef.current))
        setStatus("listening")
        const answer = await listen()
        if (!activeRef.current) break
        if (isAffirmative(answer) && !isNegative(answer)) {
          pushUser(answer)
          await execAction(reply.data.action)
        } else if (isNegative(answer) || !answer.trim()) {
          if (answer.trim()) pushUser(answer)
          await sayReply(langRef.current === "de"
            ? "In Ordnung, das mache ich nicht. Kann ich sonst noch helfen?"
            : "Alright, I won't do that. Anything else?")
        } else {
          // Not a clear yes or no — treat it as a fresh instruction/correction,
          // which the main loop records and sends to the assistant next.
          pending = answer
        }
        continue
      }

      await sayReply(reply.data.say)
      // The patient signalled they're done — the closing line was just spoken, hang up.
      if (reply.data.endCall) { endCall(); break }
    }
  }, [sayReply, execAction, listen, safeReply, endCall])

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
    status === "listening" ? t("patientProfile.voiceListening")
    : status === "thinking" ? t("patientProfile.voiceThinking")
    : status === "speaking" ? t("patientProfile.voiceSpeaking")
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
            {status === "idle" ? t("patientProfile.voiceAssistantName")
              : status === "ended" ? t("patientProfile.voiceEnded")
              : statusLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("patientProfile.voiceActions")}
          </p>
        </div>
        {inCall && (
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={endCall}>
            <PhoneOff className="w-4 h-4" /> {t("patientProfile.voiceEnd")}
          </Button>
        )}
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="h-[22rem] overflow-y-auto px-5 py-4 space-y-3">
        {bubbles.length === 0 && status === "idle" && (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-3">
            <Phone className="w-10 h-10 opacity-40" />
            <p className="max-w-xs text-sm">
              {t("patientProfile.voiceGreeting", { name: patientFirstName })}
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
            <Phone className="w-4 h-4" /> {status === "ended" ? t("patientProfile.voiceNewConversation") : t("patientProfile.voiceStartConversation")}
          </Button>
        ) : (
          <form onSubmit={submitText} className="flex items-center gap-2">
            <Input value={textInput} onChange={(e) => setTextInput(e.target.value)}
              placeholder={sttSupported ? t("patientProfile.voicePlaceholderSpeak") : t("patientProfile.voicePlaceholderType")}
              className="flex-1" />
            <Button type="submit" size="icon" variant="outline" disabled={!textInput.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        )}
        {!sttSupported && inCall && (
          <p className="text-xs text-amber-600">
            {t("patientProfile.voiceSttUnsupported")}
          </p>
        )}
      </div>
    </div>
  )
}
