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
  getAppointments,
} from "@/lib/queries"
import { bookAppointment, rescheduleAppointment, cancelAppointment } from "./appointments"
import { officeHoursViolation, CLINIC_SLOT_TIMES, MIN_BOOKING_LEAD_MIN } from "@/lib/rules"
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
  /** Type of doctor implied by the patient's concern, when they gave no name. */
  specialty?: string
  datetime?: string // new/booking time, local YYYY-MM-DDTHH:mm
  /** For reschedule/cancel: the start of the EXISTING appointment to act on. */
  target_datetime?: string
  reason?: string
}

/** Local wall-clock stamp (YYYY-MM-DDTHH:mm) for a Date. */
const stampOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`

/** Local wall-clock stamp (YYYY-MM-DDTHH:mm) — used to identify an appointment. */
const localStamp = (iso: string): string => stampOf(new Date(iso))

export interface VoiceReply {
  say: string
  action: VoiceAction | null
  /**
   * The specific appointment time the assistant is offering or confirming this
   * turn (local YYYY-MM-DDTHH:mm), if any. The server validates it against real
   * availability and corrects the reply when the model proposes an unavailable
   * time, rather than trusting the model to police its own suggestions.
   */
  proposed_datetime?: string
  /** True once the patient has indicated the conversation is finished. */
  endCall?: boolean
}

const fmt = (iso: string, lang: VoiceLang) =>
  new Date(iso).toLocaleString(lang === "de" ? "de-DE" : "en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

// Slot/working-day logic lives in lib/rules.ts (pure + unit-tested). The server
// process runs in the clinic timezone (pinned in instrumentation.ts), so the
// local Date methods below reflect clinic wall-clock time on any host.
const dayLabel = (d: Date, lang: VoiceLang) =>
  d.toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
const timeLabel = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`

/**
 * Server-side safety net mirroring the office hours given to the agent: reject a
 * requested time that is on a weekend, in the past, or outside 08:00–16:30.
 * Returns a spoken explanation, or null if the time is fine. Guards against the
 * model occasionally proposing an out-of-hours slot.
 */
function officeHoursIssue(iso: string, de: boolean): string | null {
  const violation = officeHoursViolation(iso, Date.now(), MIN_BOOKING_LEAD_MIN)
  switch (violation) {
    case "invalid":
      return de ? "Diese Uhrzeit habe ich nicht verstanden. Welcher Tag und welche Uhrzeit?" : "I didn't catch that time. What day and time?"
    case "past":
      return de ? "Dieser Zeitpunkt liegt in der Vergangenheit. Welchen Termin in der Zukunft möchten Sie?" : "That time is in the past. What future time would you like?"
    case "too_soon":
      return de
        ? `Termine müssen mindestens ${MIN_BOOKING_LEAD_MIN} Minuten im Voraus gebucht werden. Welche spätere Uhrzeit passt Ihnen?`
        : `Appointments must be booked at least ${MIN_BOOKING_LEAD_MIN} minutes in advance. What later time works for you?`
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
  availability: string,
  upcoming: string,
  now: Date,
): string {
  const de = lang === "de"
  return [
    `You are the appointment assistant for the German medical practice "Praxis AI-PMS". You are speaking with ${patientName}, a patient who is already signed in — their identity is known, so never ask for a name or date of birth.`,
    `Your only role is managing this patient's own appointments: booking, rescheduling, or cancelling. For medical questions, results, or advice, say that a staff member will follow up; for emergencies, tell them to call 112. Never give medical advice.`,
    `Manner: calm, professional, and concise, like a trained medical receptionist. Keep each reply to one or two short sentences. ${de ? "Antworte auf Deutsch." : "Reply in English."} If the patient clearly switches language, follow them. If you do not understand what the patient said, briefly ask them to repeat.`,
    ``,
    `Now: ${dayLabel(now, lang)}, ${timeLabel(now)}. Office hours are Monday to Friday, 08:00 to 17:00, in 30-minute slots (the last starts at 16:30). Use this to judge what "today", "tomorrow", or "next week" means, and never offer a time that has already passed today.`,
    ``,
    `AVAILABILITY — the only free times you may offer, grouped by day. Suggest at most three at a time and never read a whole day's list aloud. Never invent a time that is not listed:`,
    availability,
    ``,
    `CHOOSING A DOCTOR — do not volunteer or push a particular doctor:`,
    `- Our doctors are: ${doctorList}.`,
    `- If the patient describes a health concern, briefly say which kind of doctor or specialty is appropriate (for example a general practitioner or a dermatologist), without diagnosing, and record it in "specialty". The practice then assigns a suitable available doctor, whose name the patient is told once the booking is made.`,
    `- If the patient asks for one of our doctors by name, put that name in "doctor_name" and proceed — the system checks that doctor's availability when booking. If they ask for a doctor who is not in the list above, tell them who is available instead.`,
    `- Changing the doctor of an existing appointment is handled by reception. Do not claim to change it; offer to cancel it and book a new appointment instead.`,
    ``,
    `${patientName}'s upcoming appointments (identify one by its exact date and time):`,
    upcoming || "  none",
    ``,
    `PROCEDURE — you gather the details; the system does the confirming and the booking:`,
    `- Book: settle on a free time from the availability and, from the patient's concern, the kind of doctor needed, then return the "book" action.`,
    `- Reschedule: work out which existing appointment (by its date and time) and the new free time, then return the "reschedule" action with "target_datetime" set to the existing appointment's start.`,
    `- Cancel: work out which existing appointment, then return the "cancel" action with "target_datetime" set.`,
    `- Important: do NOT ask the patient "is that correct?" yourself, and NEVER say a booking is done. Once you have the needed details, return the action with a short neutral "say" such as "One moment." The system then reads the details back to the patient, asks them to confirm, and carries it out. A question from the patient (for example "is it free?") is never a confirmation.`,
    `- Whenever you offer or discuss a specific time, copy that exact time into "proposed_datetime" so it can be checked against the live schedule.`,
    `- When the patient signals they are finished (for example "that's all", "no, thank you", "goodbye", "done"), give a brief professional closing and set "endCall" to true.`,
    ``,
    `Respond with ONLY a JSON object, no markdown and no text around it:`,
    `{`,
    `  "say": "<your next sentence to the patient>",`,
    `  "proposed_datetime": "<the specific time you are offering or confirming this turn, YYYY-MM-DDTHH:mm, or empty>",`,
    `  "action": null OR {`,
    `     "type": "book" | "reschedule" | "cancel",`,
    `     "specialty": "<kind of doctor implied by the concern, or empty>",`,
    `     "doctor_name": "<only if the patient named a specific doctor, else empty>",`,
    `     "datetime": "<new/booking time YYYY-MM-DDTHH:mm, empty for cancel>",`,
    `     "target_datetime": "<for reschedule/cancel: the existing appointment's start YYYY-MM-DDTHH:mm>",`,
    `     "reason": "<short reason, or empty>"`,
    `  },`,
    `  "endCall": false`,
    `}`,
    `Keep "action" null while you still need a detail or the single confirmation — put your question in "say". Only fill "action" once the patient has confirmed every detail.`,
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

type Upcoming = Awaited<ReturnType<typeof upcomingFor>>

/** Choose which upcoming appointment a reschedule/cancel refers to. */
function pickTarget(upcoming: Upcoming, targetDatetime?: string): Upcoming[number] | null {
  if (upcoming.length === 1) return upcoming[0]
  if (targetDatetime) {
    const want = Date.parse(targetDatetime)
    if (!Number.isNaN(want)) {
      const exact = upcoming.find((a) => Date.parse(a.starts_at) === want)
      if (exact) return exact
      const nearest = upcoming
        .map((a) => ({ a, diff: Math.abs(Date.parse(a.starts_at) - want) }))
        .sort((x, y) => x.diff - y.diff)[0]
      if (nearest && nearest.diff <= 30 * 60_000) return nearest.a
    }
  }
  return null // ambiguous — the caller asks the patient to choose
}

interface Availability {
  /** Compact per-day list of free times (no doctor names) for the prompt. */
  text: string
  /** Every offerable local stamp (YYYY-MM-DDTHH:mm) — the server's source of truth. */
  freeStamps: Set<string>
}

/**
 * Free 30-minute start times across the next working days. A time is offerable
 * when at least one available doctor has no overlapping active appointment, so
 * the assistant never proposes a slot that is fully taken (one patient per
 * doctor per slot). The returned `freeStamps` set lets the server verify — and
 * override — whatever time the model proposes, instead of trusting it to obey.
 */
async function buildAvailability(lang: VoiceLang, now: Date, horizonWorkingDays = 6): Promise<Availability> {
  const de = lang === "de"
  const doctors = (await getDoctors()).filter((d) => d.is_available)
  if (doctors.length === 0) {
    return { text: de ? "Zurzeit ist kein Arzt verfügbar." : "No doctor is currently available.", freeStamps: new Set() }
  }

  const active = (await getAppointments()).filter((a) =>
    ["scheduled", "waiting", "in_progress", "completed"].includes(a.status),
  )
  const busy = new Map<string, { start: number; end: number }[]>()
  for (const a of active) {
    const start = Date.parse(a.starts_at)
    const arr = busy.get(a.doctor_id) ?? []
    arr.push({ start, end: start + (a.duration_min ?? 30) * 60_000 })
    busy.set(a.doctor_id, arr)
  }
  // Earliest bookable instant: enforce the same minimum notice the guard uses, so
  // the assistant never even offers a slot that is too close to start.
  const earliest = now.getTime() + MIN_BOOKING_LEAD_MIN * 60_000
  const anyDoctorFree = (slotStart: number) => {
    const slotEnd = slotStart + 30 * 60_000
    return doctors.some((doc) => !(busy.get(doc.id) ?? []).some((b) => b.start < slotEnd && b.end > slotStart))
  }

  const freeStamps = new Set<string>()
  const lines: string[] = []
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const todayKey = stampOf(day).slice(0, 10)
  let included = 0
  let scanned = 0
  while (included < horizonWorkingDays && scanned < 21) {
    scanned++
    const weekday = day.getDay()
    const isToday = stampOf(day).slice(0, 10) === todayKey
    if (weekday !== 0 && weekday !== 6) {
      const times: string[] = []
      for (const t of CLINIC_SLOT_TIMES) {
        const [h, m] = t.split(":").map(Number)
        const slot = new Date(day)
        slot.setHours(h, m, 0, 0)
        if (slot.getTime() >= earliest && anyDoctorFree(slot.getTime())) {
          times.push(t)
          freeStamps.add(stampOf(slot))
        }
      }
      if (times.length) {
        lines.push(`${dayLabel(day, lang)}${isToday ? (de ? " (heute)" : " (today)") : ""}: ${times.join(", ")}`)
        included++
      } else if (isToday) {
        // Make it explicit that nothing remains today, so the model stops offering it.
        lines.push(`${dayLabel(day, lang)}${de ? " (heute)" : " (today)"}: ${de ? "keine Termine mehr heute" : "no more appointments today"}`)
      }
    }
    day.setDate(day.getDate() + 1)
  }
  const hasFree = freeStamps.size > 0
  return {
    text: hasFree
      ? lines.join("\n")
      : de ? "In den nächsten Tagen sind keine Termine frei." : "No free slots in the coming days.",
    freeStamps,
  }
}

/** The next few free stamps from now, spoken back when the model proposes a bad time. */
function nextFreeTimes(freeStamps: Set<string>, nowMs: number, lang: VoiceLang, count = 3): string {
  const upcoming = [...freeStamps]
    .filter((s) => Date.parse(s) > nowMs)
    .sort()
    .slice(0, count)
    .map((s) => fmt(new Date(s).toISOString(), lang))
  if (upcoming.length === 0) {
    return lang === "de" ? " In den nächsten Tagen ist leider nichts frei." : " There is nothing free in the coming days."
  }
  return (lang === "de" ? " Die nächsten freien Zeiten sind: " : " The next available times are: ") + upcoming.join("; ") + "."
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

    const now = new Date()
    const [doctors, upcoming, availability] = await Promise.all([
      getDoctors(),
      upcomingFor(patient.id),
      buildAvailability(lang, now),
    ])
    const doctorList =
      doctors
        .filter((d) => d.is_available)
        .map((d) => `Dr. ${d.first_name} ${d.last_name} (${d.specialization})`)
        .join(", ") || "the duty doctor"
    const upcomingStr = upcoming
      .map((a) => `- ${fmt(a.starts_at, lang)} with Dr. ${a.doctor?.last_name ?? "?"} [start: ${localStamp(a.starts_at)}]`)
      .join("\n")

    const chat = [
      {
        role: "system" as const,
        content: systemPrompt(lang, `${patient.first_name} ${patient.last_name}`, doctorList, availability.text, upcomingStr, now),
      },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ]
    if (messages.length === 0) {
      chat.push({ role: "user", content: "[Conversation opened — greet the patient by first name and ask how you can help with their appointments.]" })
    }

    const raw = await mistralChat(chat, { temperature: 0.4, json: true })
    const parsed = JSON.parse(raw) as Partial<VoiceReply>
    let say = typeof parsed.say === "string" ? parsed.say : ""
    let action =
      parsed.action && typeof parsed.action === "object" && parsed.action.type
        ? (parsed.action as VoiceAction)
        : null
    const endCall = parsed.endCall === true

    // Deterministic guard: the model is not trusted to police its own suggestions.
    // Whenever it offers or commits to a specific time, verify that time against
    // the live availability and correct the reply when it does not hold up. This
    // is what stops a past or already-taken slot from ever being offered, even if
    // the model claims it is free.
    const de = lang === "de"
    const candidate = (parsed.proposed_datetime?.trim() || (action && action.type !== "cancel" ? action.datetime?.trim() : "") || "")
    if (candidate && !Number.isNaN(Date.parse(candidate))) {
      const hoursIssue = officeHoursIssue(candidate, de)
      // Normalize whatever datetime shape the model returned to the local stamp
      // format the availability set uses, so the lookup is not defeated by stray
      // seconds or a trailing "Z".
      const offerable = availability.freeStamps.has(stampOf(new Date(candidate)))
      if (hoursIssue || !offerable) {
        const lead = hoursIssue ?? (de ? "Diese Uhrzeit ist leider nicht mehr frei." : "That time isn't available anymore.")
        say = lead + nextFreeTimes(availability.freeStamps, now.getTime(), lang)
        action = null // never commit an action on a time the schedule rejects
      }
    }

    if (!say && !action) return fail("The assistant did not return a usable reply.")
    return ok({ say, action, endCall })
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

/** Whether the patient supplied a real doctor name (rather than "any"/blank). */
const patientNamedDoctor = (name?: string) =>
  Boolean(name && name.trim() && !/any|egal|beliebig|whoever|anyone/i.test(name))

/**
 * Pick an available doctor with no overlapping appointment at the chosen slot,
 * preferring one whose specialization matches the patient's concern. Returns
 * null when every doctor is busy at that time.
 */
async function assignFreeDoctor(slotStartMs: number, specialty?: string) {
  const doctors = (await getDoctors()).filter((d) => d.is_available)
  const active = (await getAppointments()).filter((a) =>
    ["scheduled", "waiting", "in_progress", "completed"].includes(a.status),
  )
  const slotEnd = slotStartMs + 30 * 60_000
  const free = doctors.filter(
    (doc) =>
      !active.some(
        (a) =>
          a.doctor_id === doc.id &&
          Date.parse(a.starts_at) < slotEnd &&
          Date.parse(a.starts_at) + (a.duration_min ?? 30) * 60_000 > slotStartMs,
      ),
  )
  if (free.length === 0) return null
  const wanted = specialty?.trim().toLowerCase()
  if (wanted) {
    const match = free.find((d) => {
      const s = (d.specialization ?? "").toLowerCase()
      return s.includes(wanted) || wanted.includes(s)
    })
    if (match) return match
  }
  return free[0]
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
      if (!action.datetime || Number.isNaN(Date.parse(action.datetime))) {
        return ok({ done: false, say: de ? "Für welchen Tag und welche Uhrzeit möchten Sie den Termin?" : "What day and time would you like the appointment?" })
      }
      const hoursIssue = officeHoursIssue(action.datetime, de)
      if (hoursIssue) return ok({ done: false, say: hoursIssue })

      // The patient only names a doctor when they ask for one; otherwise the
      // practice assigns a suitable doctor who is free at the chosen time.
      const slotMs = Date.parse(action.datetime)
      const doctor = patientNamedDoctor(action.doctor_name)
        ? matchDoctor(await getDoctors(), action.doctor_name)
        : await assignFreeDoctor(slotMs, action.specialty)
      if (!doctor) {
        return ok({
          done: false,
          say: patientNamedDoctor(action.doctor_name)
            ? (de ? "Diese Ärztin oder diesen Arzt finde ich leider nicht. Wen möchten Sie?" : "I can't find that doctor. Who would you like to see?")
            : (de ? "Zu dieser Uhrzeit ist leider kein Arzt frei. Möchten Sie eine andere Uhrzeit?" : "No doctor is free at that time. Would you like a different time?"),
        })
      }

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

    // ── Reschedule / Cancel — act on the specific appointment the patient meant ─
    const upcoming = await upcomingFor(patient.id)
    if (upcoming.length === 0) {
      return ok({ done: false, say: de ? "Sie haben keinen anstehenden Termin, den ich ändern könnte. Möchten Sie stattdessen einen neuen buchen?" : "You don't have an upcoming appointment to change. Would you like to book a new one instead?" })
    }
    const target = pickTarget(upcoming, action.target_datetime)
    if (!target) {
      const list = upcoming
        .map((a) => `${fmt(a.starts_at, lang)} ${de ? "bei" : "with"} Dr. ${a.doctor?.last_name ?? "?"}`)
        .join(de ? " oder " : " or ")
      return ok({ done: false, say: de ? `Welchen Termin meinen Sie: ${list}?` : `Which appointment do you mean: ${list}?` })
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
