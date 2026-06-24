"use client"

/**
 * Global consultation voice scribe (Feature 9 — ambient capture).
 *
 * Mounted once in the doctor shell so it survives client-side navigation: the
 * doctor starts recording in the workspace, then moves to any page while the
 * capture keeps running, shown as a small floating widget in the corner.
 *
 * Pipeline (works without any extra infrastructure):
 *   1. The browser's Web Speech API transcribes the live conversation to text
 *      (no manual speaker tagging, no audio file stored by the app).
 *   2. On stop, the raw transcript is sent to the LLM (`diarizeTranscript`),
 *      which splits it into "Arzt:" / "Patient:" turns by reasoning over the
 *      content — automatic speaker attribution with no acoustic diariser.
 *   3. The labelled transcript is offered for insertion into the matching
 *      consultation's notes.
 *
 * Privacy note: in Chrome the speech engine routes audio to the browser
 * vendor's service, and the transcript text is sent to the (currently external)
 * LLM. For production GDPR compliance both are swapped for self-hosted models
 * (e.g. Whisper for STT); the pipeline above is unchanged.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react"
import { Square, X, Loader2, FileText, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { diarizeTranscript } from "@/lib/actions/ai"

type Status = "idle" | "recording" | "processing" | "ready" | "error"
type Lang = "de-DE" | "en-US"
interface Consultation { appointmentId: string; patientName: string }
interface Result { appointmentId: string; text: string }

interface RecordingApi {
  status: Status
  elapsed: number
  consultation: Consultation | null
  result: Result | null
  lang: Lang
  setLang: (l: Lang) => void
  start: (c: Consultation) => void
  stop: () => void
  discard: () => void
  /** Returns the ready transcript text and resets the recorder. */
  consumeResult: () => string | null
}

const Ctx = createContext<RecordingApi | null>(null)

export function useRecording(): RecordingApi {
  const c = useContext(Ctx)
  if (!c) throw new Error("useRecording must be used within <RecordingProvider>")
  return c
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("idle")
  const [elapsed, setElapsed] = useState(0)
  const [consultation, setConsultation] = useState<Consultation | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [lang, setLang] = useState<Lang>("de-DE")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null)
  const transcriptRef = useRef("")
  const recordingRef = useRef(false)
  const consultRef = useRef<Consultation | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const langRef = useRef<Lang>(lang)
  langRef.current = lang

  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }

  const start = useCallback((c: Consultation) => {
    if (recordingRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    if (!SR) { setStatus("error"); setConsultation(c); return }

    transcriptRef.current = ""
    const r = new SR()
    r.lang = langRef.current
    r.continuous = true
    r.interimResults = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) transcriptRef.current += e.results[i][0].transcript + " "
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { recordingRef.current = false; clearTimer(); setStatus("error") }
    }
    r.onend = () => {
      if (recordingRef.current) { try { r.start() } catch { /* already running */ } ; return }
      // User stopped → send the raw transcript to the LLM for speaker splitting.
      const raw = transcriptRef.current.trim()
      const appt = consultRef.current?.appointmentId
      if (!raw || !appt) { setStatus("idle"); setConsultation(null); setElapsed(0); return }
      setStatus("processing")
      diarizeTranscript(raw, langRef.current.startsWith("de") ? "de" : "en")
        .then((res) => {
          const text = res.status === "ok" && res.data?.transcript ? res.data.transcript : raw
          setResult({ appointmentId: appt, text })
          setStatus("ready")
        })
        .catch(() => { setResult({ appointmentId: appt, text: raw }); setStatus("ready") })
    }

    recogRef.current = r
    consultRef.current = c
    recordingRef.current = true
    try { r.start() } catch { /* ignore */ }
    setConsultation(c); setResult(null); setElapsed(0); setStatus("recording")
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
  }, [])

  const stop = useCallback(() => {
    recordingRef.current = false
    clearTimer()
    try { recogRef.current?.stop() } catch { /* ignore */ }
  }, [])

  const discard = useCallback(() => {
    recordingRef.current = false
    clearTimer()
    if (recogRef.current) { recogRef.current.onend = null; try { recogRef.current.stop() } catch { /* ignore */ } }
    transcriptRef.current = ""
    setStatus("idle"); setConsultation(null); setResult(null); setElapsed(0)
  }, [])

  const consumeResult = useCallback(() => {
    const t = result?.text ?? null
    setResult(null); setStatus("idle"); setConsultation(null); setElapsed(0)
    return t
  }, [result])

  const api: RecordingApi = { status, elapsed, consultation, result, lang, setLang, start, stop, discard, consumeResult }

  return (
    <Ctx.Provider value={api}>
      {children}
      {status !== "idle" && <FloatingWidget {...api} />}
    </Ctx.Provider>
  )
}

function FloatingWidget({ status, elapsed, consultation, stop, discard }: RecordingApi) {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-2xl p-3">
      {status === "recording" && (
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">Recording · {mmss(elapsed)}</p>
            <p className="text-xs text-muted-foreground truncate">{consultation?.patientName}</p>
          </div>
          <Button size="sm" variant="destructive" className="gap-1.5 h-8" onClick={stop}>
            <Square className="w-3.5 h-3.5" /> Stop
          </Button>
          <button onClick={discard} title="Discard" className="text-muted-foreground hover:text-destructive shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {status === "processing" && (
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Splitting Arzt / Patient…</p>
            <p className="text-xs text-muted-foreground truncate">{consultation?.patientName}</p>
          </div>
        </div>
      )}
      {status === "ready" && (
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Transcript ready</p>
            <p className="text-xs text-muted-foreground truncate">Open {consultation?.patientName}&apos;s consultation to insert it.</p>
          </div>
          <button onClick={discard} title="Discard" className="text-muted-foreground hover:text-destructive shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Voice capture unavailable</p>
            <p className="text-xs text-muted-foreground">Use desktop Chrome and allow the microphone.</p>
          </div>
          <button onClick={discard} title="Dismiss" className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
