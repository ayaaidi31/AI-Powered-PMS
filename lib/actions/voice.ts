"use server"

/**
 * Feature 11 — AI voice booking assistant (patient self-service).
 *
 * A logged-in patient talks to the assistant from the website/app to book,
 * reschedule, or cancel their own appointments — an alternative to filling in
 * the booking form by hand. Because the patient is authenticated, the agent
 * never has to ask for name or date of birth: identity comes from the session.
 *
 *   - voiceAgentReply(): the conversational brain. Greets the patient by name,
 *     works out what they want, asks for any missing detail, confirms, and only
 *     then returns a structured `action`.
 *   - executeVoiceAction(): commits the confirmed action against the database
 *     for the session patient, through the existing appointment actions (with
 *     the live double-booking guard). Bookings are tagged `source = 'ai_voice'`
 *     and queued for receptionist review (`ai_review_status = 'pending'`).
 *
 * Speech-to-text and text-to-speech run in the browser. The Mistral call here is
 * the single LLM seam (lib/llm/mistral.ts) and will be swapped for the RAG model
 * later with no change to this contract.
 */
import { mistralChat, isLlmConfigured } from "@/lib/llm/mistral"
import {
  getDoctors,
  getCurrentPatient,
  getAppointmentsByPatient,
} from "@/lib/queries"
import { bookAppointment, rescheduleAppointment, cancelAppointment } from "./appointments"
import { officeHoursViolation } from "@/lib/rules"
import { ok, fail, type ActionResult } from "./types"

/** Label recorded on reschedule/cancel so reception sees the AI touched it. */
const VOICE_MARK = "KI-Assistent (Patient)"

export type VoiceLang = "de" | "en"

export interface VoiceMsg {
  role: "user" | "assistant"
  content: string
}

export interface VoiceAction {
  type: "book" | "reschedule" | "cancel"
  doctor_name?: string
  datetime?: string // ISO local, YYYY-MM-DDTHH:mm
  reason?: string
}

export interface VoiceReply {
  say: string
  action: VoiceAction | null
}

const fmt = (iso: string, lang: VoiceLang) =>
  new Date(iso).toLocaleString(lang === "de" ? "de-DE" : "en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

/**
 * Server-side safety net mirroring the office hours given to the agent: reject a
 * requested time that is on a weekend, in the past, or outside 08:00–16:30.
 * Returns a spoken explanation, or null if the time is fine. Guards against the
 * model occasionally proposing an out-of-hours slot.
 */
function officeHoursIssue(iso: string, de: boolean): string | null {
  const violation = officeHoursViolation(iso, Date.now())
  switch (violation) {
    case "invalid":
      return de ? "Diese Uhrzeit habe ich nicht verstanden. Welcher Tag und welche Uhrzeit?" : "I didn't catch that time. What day and time?"
    case "past":
      return de ? "Dieser Zeitpunkt liegt in der Vergangenheit. Welchen Termin in der Zukunft möchten Sie?" : "That time is in the past. What future time would you like?"
    case "weekend":
      return de ? "An Wochenenden hat die Praxis geschlossen. Möchten Sie einen Termin an einem Wochentag?" : "The practice is closed at weekends. Would you like a weekday instead?"
    case "closed":
      return de ? "Zu dieser Uhrzeit ist die Praxis geschlossen — die Sprechzeiten sind Montag bis Freitag von 08:00 bis 17:00 Uhr. Welche Uhrzeit passt Ihnen?" : "We're closed then — office hours are Monday to Friday, 08:00 to 17:00. What time works for you?"
    default:
      return null
  }
}

function systemPrompt(
  lang: VoiceLang,
  patientName: string,
  doctorList: string,
  upcoming: string,
  nowIso: string,
): string {
  return [
    `You are the friendly AI booking assistant of the German medical practice "Praxis AI-PMS". You are talking with ${patientName}, a logged-in patient — you already know who they are, so NEVER ask for their name or date of birth.`,
    `You can ONLY help with their own appointments: book a new one, reschedule one, or cancel one. For medical questions or results, say a staff member will help; for emergencies tell them to call 112. Never give medical advice.`,
    ``,
    `Current date and time (ISO 8601): ${nowIso}.`,
    `Office hours: Monday to Friday, 08:00 to 17:00 — that is 8 a.m. to 5 p.m. Appointments start every 30 minutes, and the last one starts at 16:30.`,
    `So 08:00, 09:30, 12:00 (noon), 14:00 (2 p.m.), 15:00 (3 p.m.) and 16:30 are all OPEN and valid. Only times before 08:00, after 17:00, or on Saturday/Sunday are closed. NEVER refuse a weekday time that falls between 08:00 and 17:00 — for example 15:00 / 3 p.m. is open, not closed.`,
    `Doctors at the practice: ${doctorList}.`,
    `${patientName}'s upcoming appointments: ${upcoming || "none"}.`,
    ``,
    `How to behave:`,
    `- Speak naturally and briefly, like a warm receptionist. ${lang === "de" ? "Antworte auf Deutsch." : "Reply in English."} If the patient clearly switches language, follow them.`,
    `- To BOOK: find out which doctor (or "any available") and the wished date and time. Turn relative wishes ("next Tuesday morning", "tomorrow at 10") into an absolute date and time from the current date above. Offer only times within office hours, Monday–Friday.`,
    `- To RESCHEDULE: confirm which of their upcoming appointments and the new date and time.`,
    `- To CANCEL: confirm which upcoming appointment they want to cancel.`,
    `- Always repeat the final details back and wait for a clear "yes" before acting.`,
    ``,
    `Respond with ONLY a JSON object, no markdown and no text around it:`,
    `{`,
    `  "say": "<the next sentence you say to the patient>",`,
    `  "action": null OR {`,
    `     "type": "book" | "reschedule" | "cancel",`,
    `     "doctor_name": "<doctor full name, or empty for any>",`,
    `     "datetime": "<YYYY-MM-DDTHH:mm, or empty for cancel>",`,
    `     "reason": "<short reason, or empty>"`,
    `  }`,
    `}`,
    `Keep "action" null while you still need a detail or a confirmation — put your question in "say". Only fill "action" once the patient has confirmed every detail.`,
  ].join("\n")
}

async function upcomingFor(patientId: string) {
  const [appts, doctors] = await Promise.all([getAppointmentsByPatient(patientId), getDoctors()])
  const byId = new Map(doctors.map((d) => [d.id, d]))
  const now = Date.now()
  return appts
    .filter((a) => a.status === "scheduled" && Date.parse(a.starts_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .map((a) => ({ ...a, doctor: byId.get(a.doctor_id) }))
}

/**
 * One conversational turn. `messages` is the dialogue so far (call with an empty
 * array to get the greeting).
 */
export async function voiceAgentReply(
  messages: VoiceMsg[],
  lang: VoiceLang = "de",
): Promise<ActionResult<VoiceReply>> {
  if (!isLlmConfigured()) {
    return fail("The voice assistant is not configured (MISTRAL_API_KEY missing).")
  }
  try {
    const patient = await getCurrentPatient()
    if (!patient) return fail("Please sign in as a patient to use the voice assistant.")

    const doctors = await getDoctors()
    const doctorList =
      doctors
        .filter((d) => d.is_available)
        .map((d) => `Dr. ${d.first_name} ${d.last_name} (${d.specialization})`)
        .join(", ") || "the duty doctor"
    const upcoming = await upcomingFor(patient.id)
    const upcomingStr = upcoming
      .map((a) => `${fmt(a.starts_at, lang)} with Dr. ${a.doctor?.last_name ?? "?"}`)
      .join("; ")
    const nowIso = new Date().toISOString()

    const chat = [
      {
        role: "system" as const,
        content: systemPrompt(lang, `${patient.first_name} ${patient.last_name}`, doctorList, upcomingStr, nowIso),
      },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ]
    if (messages.length === 0) {
      chat.push({ role: "user", content: "[Conversation opened — greet the patient by first name and ask how you can help with their appointments.]" })
    }

    const raw = await mistralChat(chat, { temperature: 0.4, json: true })
    const parsed = JSON.parse(raw) as Partial<VoiceReply>
    const say = typeof parsed.say === "string" ? parsed.say : ""
    const action =
      parsed.action && typeof parsed.action === "object" && parsed.action.type
        ? (parsed.action as VoiceAction)
        : null
    if (!say && !action) return fail("The assistant did not return a usable reply.")
    return ok({ say, action })
  } catch {
    return fail("The voice assistant could not be reached. Please try again.")
  }
}

function matchDoctor(doctors: Awaited<ReturnType<typeof getDoctors>>, name?: string) {
  const available = doctors.filter((d) => d.is_available)
  if (!name || !name.trim() || /any|egal|beliebig/i.test(name)) return available[0] ?? doctors[0] ?? null
  const n = name.toLowerCase().replace(/^dr\.?\s*/i, "").trim()
  return (
    doctors.find((d) => `${d.first_name} ${d.last_name}`.toLowerCase() === n) ??
    doctors.find((d) => d.last_name.toLowerCase() === n) ??
    doctors.find((d) => `${d.first_name} ${d.last_name}`.toLowerCase().includes(n)) ??
    doctors.find((d) => n.includes(d.last_name.toLowerCase())) ??
    null
  )
}

/**
 * Commit a confirmed voice action for the session patient. Returns a short
 * spoken outcome in `data.say`.
 */
export async function executeVoiceAction(
  action: VoiceAction,
  lang: VoiceLang = "de",
): Promise<ActionResult<{ say: string; done: boolean }>> {
  const de = lang === "de"
  try {
    const patient = await getCurrentPatient()
    if (!patient) return fail("Please sign in as a patient to use the voice assistant.")

    // ── Booking ───────────────────────────────────────────────────────
    if (action.type === "book") {
      const doctors = await getDoctors()
      const doctor = matchDoctor(doctors, action.doctor_name)
      if (!doctor) {
        return ok({ done: false, say: de ? "Diese Ärztin oder diesen Arzt finde ich leider nicht. Wen möchten Sie?" : "I can't find that doctor. Who would you like to see?" })
      }
      if (!action.datetime || Number.isNaN(Date.parse(action.datetime))) {
        return ok({ done: false, say: de ? "Für welchen Tag und welche Uhrzeit möchten Sie den Termin?" : "What day and time would you like the appointment?" })
      }
      const hoursIssue = officeHoursIssue(action.datetime, de)
      if (hoursIssue) return ok({ done: false, say: hoursIssue })

      const startsAt = new Date(action.datetime).toISOString()
      const res = await bookAppointment({
        patient_id: patient.id,
        doctor_id: doctor.id,
        starts_at: startsAt,
        duration_min: 30,
        reason: action.reason?.trim() || (de ? "Terminbuchung per KI-Assistent" : "Booked via AI assistant"),
        source: "ai_voice",
      })
      if (res.status === "conflict") {
        return ok({ done: false, say: de ? "Dieser Termin ist leider schon vergeben. Möchten Sie eine andere Uhrzeit?" : "That slot is already taken. Would you like a different time?" })
      }
      if (res.status !== "ok") {
        return ok({ done: false, say: de ? `Das hat nicht geklappt: ${res.message}` : `That didn't work: ${res.message}` })
      }
      return ok({
        done: true,
        say: de
          ? `Erledigt! Ihr Termin bei Dr. ${doctor.last_name} ist am ${fmt(startsAt, lang)} Uhr. Die Praxis prüft die Buchung noch kurz. Kann ich sonst noch helfen?`
          : `Done! Your appointment with Dr. ${doctor.last_name} is on ${fmt(startsAt, lang)}. Reception will quickly review it. Anything else?`,
      })
    }

    // ── Reschedule / Cancel — act on the patient's next upcoming appointment ─
    const upcoming = await upcomingFor(patient.id)
    const target = upcoming[0]
    if (!target) {
      return ok({ done: false, say: de ? "Sie haben keinen anstehenden Termin, den ich ändern könnte. Möchten Sie stattdessen einen neuen buchen?" : "You don't have an upcoming appointment to change. Would you like to book a new one instead?" })
    }

    if (action.type === "cancel") {
      const res = await cancelAppointment(target.id, { reasonForChange: VOICE_MARK })
      if (res.status !== "ok") {
        return ok({ done: false, say: de ? `Das Stornieren hat nicht geklappt: ${res.message}` : `I couldn't cancel that: ${res.message}` })
      }
      return ok({ done: true, say: de ? `Ihr Termin am ${fmt(target.starts_at, lang)} Uhr ist storniert. Kann ich sonst noch helfen?` : `Your appointment on ${fmt(target.starts_at, lang)} is cancelled. Anything else?` })
    }

    // reschedule
    if (!action.datetime || Number.isNaN(Date.parse(action.datetime))) {
      return ok({ done: false, say: de ? "Auf welchen Tag und welche Uhrzeit möchten Sie verschieben?" : "What new day and time would you like?" })
    }
    const hoursIssue = officeHoursIssue(action.datetime, de)
    if (hoursIssue) return ok({ done: false, say: hoursIssue })

    const newStart = new Date(action.datetime).toISOString()
    const res = await rescheduleAppointment(target.id, newStart, { reasonForChange: VOICE_MARK })
    if (res.status === "conflict") {
      return ok({ done: false, say: de ? "Diese neue Uhrzeit ist leider schon belegt. Möchten Sie eine andere?" : "That new time is already taken. Would you like another one?" })
    }
    if (res.status !== "ok") {
      return ok({ done: false, say: de ? `Das Verschieben hat nicht geklappt: ${res.message}` : `I couldn't reschedule that: ${res.message}` })
    }
    return ok({ done: true, say: de ? `Erledigt. Ihr Termin ist jetzt am ${fmt(newStart, lang)} Uhr. Kann ich sonst noch helfen?` : `Done. Your appointment is now on ${fmt(newStart, lang)}. Anything else?` })
  } catch {
    return ok({ done: false, say: de ? "Es gab gerade ein technisches Problem. Können wir es noch einmal versuchen?" : "Something went wrong on our side just now. Shall we try that again?" })
  }
}
