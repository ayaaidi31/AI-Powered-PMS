"use server"

/**
 * AI actions (temporary Mistral layer — Features 2 & 12).
 *
 * Two model-backed steps, both kept behind lib/llm/mistral.ts so the RAG system
 * can replace them later:
 *   - generateConsultationReport: rough notes → structured clinical report.
 *   - suggestBillingCodes: report → billing codes, using a retrieve-then-select
 *     (RAG-lite) approach. It first retrieves candidate codes from the real
 *     catalog (the GP base GOPs + EBM codes matching the services extracted from
 *     the report, or the full GOÄ table), then asks the model to select only from
 *     that candidate list at temperature 0. So the model never invents codes and
 *     only picks relevant ones; selections are still re-checked against the
 *     candidate set, and the Doctor approves (REQ-BIL-04). This temporary layer
 *     is replaced by the proper RAG retrieval over the full catalog later.
 *
 * Note (NFR-SEC-01): the patient's name is not sent to the model; only the
 * clinical context is. Full PII masking of free-text notes is left to the RAG
 * integration.
 */
import { sql } from "@/lib/db"
import { mistralChat, isLlmConfigured } from "@/lib/llm/mistral"
import { getEbmCode, searchEbmCodes } from "@/lib/codes/ebm"
import { CLINIC, CLINIC_FAQ } from "@/lib/clinic"
import { retrieveChunks } from "@/lib/rag/retrieve"
import { getReportsByPatient, getVitalsByPatient } from "@/lib/queries"
import type { VitalsRow } from "@/lib/seed-data"
import type { UrgencyLevel } from "@/lib/recovery-plan"
export type { UrgencyLevel } from "@/lib/recovery-plan"
import { matchAllergyAlerts, type SafetyAlert } from "@/lib/clinical-safety"
export type { SafetyAlert } from "@/lib/clinical-safety"
import { ok, fail, type ActionResult } from "./types"
import type { CodeSuggestion } from "./codes"
import { languageDirective, directiveFor, type UiAiLang } from "@/lib/ai-language"
import { getT } from "@/lib/i18n/server"
import { requireDoctor, requireStaff, requireSession } from "@/lib/auth/guard"

/** Format a vitals row into a compact clinical string (German units). */
function fmtVitals(v: VitalsRow): string {
  const p: string[] = []
  if (v.systolic != null && v.diastolic != null) p.push(`RR ${v.systolic}/${v.diastolic} mmHg`)
  if (v.heart_rate != null) p.push(`HF ${v.heart_rate}/min`)
  if (v.temperature_c != null) p.push(`Temp ${v.temperature_c} °C`)
  if (v.weight_kg != null) p.push(`${v.weight_kg} kg`)
  if (v.height_cm != null) p.push(`${v.height_cm} cm`)
  return p.join(", ")
}

interface ReportInput {
  rawNotes: string
  diagnosis?: string
  treatment?: string
  context?: { conditions: string[]; allergies: string[]; medications: string[]; vitals?: string | null }
  /** Language the generated report should be written in (chosen at the feature). */
  lang?: UiAiLang
}

/** Turn the doctor's rough notes into a structured, formal clinical report. */
export async function generateConsultationReport(
  input: ReportInput,
): Promise<ActionResult<{ report: string }>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  if (!input.rawNotes.trim() && !input.diagnosis?.trim()) {
    return fail("Enter some notes first.")
  }

  const ctx = input.context
  const contextBlock = ctx
    ? [
        ctx.conditions.length ? `Pre-existing conditions: ${ctx.conditions.join(", ")}` : "",
        ctx.allergies.length ? `Allergies: ${ctx.allergies.join(", ")}` : "",
        ctx.medications.length ? `Current medication: ${ctx.medications.join(", ")}` : "",
        ctx.vitals ? `Vitals (this consultation): ${ctx.vitals}` : "",
      ].filter(Boolean).join("\n")
    : ""

  try {
    const report = await mistralChat(
      [
        {
          role: "system",
          content:
            "You are a medical documentation assistant. Turn the doctor's shorthand consultation notes into a formal, structured clinical report. " +
            "Use the sections: History, Findings, Diagnosis, Treatment/Plan. " +
            "If vitals are provided, include them in the Findings. " +
            "Do not invent findings, values or diagnoses that are not in the notes or vitals. Do not include personal identifiers. " +
            directiveFor(input.lang),
        },
        {
          role: "user",
          content:
            (contextBlock ? `Patient context:\n${contextBlock}\n\n` : "") +
            `Notes:\n${input.rawNotes}\n` +
            (input.diagnosis ? `\nDiagnosis: ${input.diagnosis}` : "") +
            (input.treatment ? `\nTreatment: ${input.treatment}` : ""),
        },
      ],
      { temperature: 0.3 },
    )
    return ok({ report: report.trim() })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Report generation failed.")
  }
}

/**
 * Suggest billing codes for a report, grounded in the real catalog. Returns the
 * same shape as the manual search so the workspace can add them directly.
 */
export async function suggestBillingCodes(
  reportText: string,
  insuranceType: "gkv" | "pkv" | "selbstzahler",
): Promise<ActionResult<CodeSuggestion[]>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  if (!reportText.trim()) return fail("Generate or write the report first.")

  const catalog: "EBM" | "GOAE" = insuranceType === "gkv" ? "EBM" : "GOAE"

  try {
    // 1) Build a pool of candidate codes from the real catalog (retrieval).
    const candidates =
      catalog === "EBM" ? await buildEbmCandidates(reportText) : await loadGoaeCandidates()
    if (candidates.length === 0) return ok([])

    // 2) Let the model select only from those candidates. Temperature 0 makes
    //    the choice deterministic, and it cannot invent codes.
    const list = candidates.map((c) => `${c.code} — ${c.description}`).join("\n")
    const raw = await mistralChat(
      [
        {
          role: "system",
          content:
            "Du bist ein Abrechnungsassistent für eine hausärztliche Praxis. Wähle aus der Kandidatenliste " +
            `ausschließlich die ${catalog}-Ziffern aus, die durch den Bericht eindeutig belegt sind. ` +
            "Wähle NUR Codes aus der Liste; erfinde keine Codes; im Zweifel weglassen. " +
            'Antworte ausschließlich als JSON: {"codes":[{"code":"...","reason":"..."}]}.',
        },
        { role: "user", content: `Bericht:\n${reportText.slice(0, 6000)}\n\nKandidaten:\n${list}` },
      ],
      { json: true, temperature: 0 },
    )
    const parsed = JSON.parse(raw) as { codes?: { code?: string }[] }
    const picked = (parsed.codes ?? []).map((c) => (c.code ?? "").trim()).filter(Boolean)

    // 3) Keep only codes that were genuinely in the candidate list.
    const byCode = new Map(candidates.map((c) => [c.code, c]))
    const seen = new Set<string>()
    const result: CodeSuggestion[] = []
    for (const code of picked) {
      if (seen.has(code)) continue
      seen.add(code)
      const c = byCode.get(code)
      if (c) result.push(c)
    }
    return ok(result)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Code suggestion failed.")
  }
}

/**
 * Extract the medications newly prescribed or changed in this consultation
 * (name, dosage, frequency). The patient's existing medication is passed in so
 * the model can exclude it — only meds that are new, or whose dose changed, are
 * returned (not the ongoing Dauermedikation merely mentioned as history).
 */
export async function extractPrescriptions(
  text: string,
  currentMedications: string[] = [],
): Promise<ActionResult<{ medication: string; dosage: string; frequency: string }[]>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  if (!text.trim()) return fail("Enter notes or generate the report first.")
  try {
    const raw = await mistralChat(
      [
        {
          role: "system",
          content:
            "Extrahiere aus dem Text AUSSCHLIESSLICH die in dieser Konsultation NEU verordneten oder in der " +
            "Dosierung GEÄNDERTEN Medikamente (Therapie / Verordnung / Rezept). " +
            "Übernimm KEINE bestehende Dauermedikation, die nur als Vorgeschichte/Anamnese erwähnt wird und " +
            "unverändert bleibt. Für jedes Medikament: Name/Wirkstoff, Dosierung, Einnahmehäufigkeit. " +
            "Erfinde nichts; nimm nur, was im Text steht. " +
            'Antworte ausschließlich als JSON: {"prescriptions":[{"medication":"...","dosage":"...","frequency":"..."}]}.',
        },
        {
          role: "user",
          content:
            (currentMedications.length
              ? `Bestehende Dauermedikation (NICHT übernehmen, außer die Dosis wurde im Text geändert):\n${currentMedications.join("\n")}\n\n`
              : "") + `Text:\n${text.slice(0, 6000)}`,
        },
      ],
      { json: true, temperature: 0 },
    )
    const parsed = JSON.parse(raw) as {
      prescriptions?: { medication?: string; dosage?: string; frequency?: string }[]
    }
    const list = (parsed.prescriptions ?? [])
      .map((p) => ({
        medication: (p.medication ?? "").trim(),
        dosage: (p.dosage ?? "").trim(),
        frequency: (p.frequency ?? "").trim(),
      }))
      .filter((p) => p.medication)
    return ok(list)
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Prescription extraction failed.")
  }
}

interface ExtractedVitals {
  systolic: number | null
  diastolic: number | null
  heart_rate: number | null
  temperature_c: number | null
  weight_kg: number | null
  height_cm: number | null
}

/** Extract vital signs (BP, pulse, temperature, weight, height) from the notes. */
export async function extractVitals(text: string): Promise<ActionResult<ExtractedVitals>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  if (!text.trim()) return fail("Enter notes first.")
  try {
    const raw = await mistralChat(
      [
        {
          role: "system",
          content:
            "Extrahiere die Vitalparameter aus dem Arzttext. Felder: systolic (oberer Blutdruck mmHg), " +
            "diastolic (unterer Blutdruck mmHg), heart_rate (Puls/Herzfrequenz /min), temperature_c " +
            "(Körpertemperatur °C), weight_kg (Gewicht kg), height_cm (Größe cm). Nimm nur Werte, die im " +
            "Text stehen; fehlende Werte = null. Antworte ausschließlich als JSON: " +
            '{"systolic":null,"diastolic":null,"heart_rate":null,"temperature_c":null,"weight_kg":null,"height_cm":null}.',
        },
        { role: "user", content: text.slice(0, 6000) },
      ],
      { json: true, temperature: 0 },
    )
    const p = JSON.parse(raw) as Record<string, unknown>
    const num = (v: unknown): number | null => {
      if (typeof v === "number" && isFinite(v)) return v
      if (typeof v === "string" && v.trim() && !isNaN(Number(v.replace(",", ".")))) return Number(v.replace(",", "."))
      return null
    }
    return ok({
      systolic: num(p.systolic),
      diastolic: num(p.diastolic),
      heart_rate: num(p.heart_rate),
      temperature_c: num(p.temperature_c),
      weight_kg: num(p.weight_kg),
      height_cm: num(p.height_cm),
    })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Vitals extraction failed.")
  }
}

/**
 * Patient-facing simplification (Feature 15, REQ-SIMP-01): rewrite a medical
 * report in plain, reassuring language a layperson can understand. Strictly
 * explanatory — it must not invent findings, diagnoses or recommendations.
 */
export async function simplifyReport(reportText: string, lang?: UiAiLang): Promise<ActionResult<{ summary: string }>> {
  const g = await requireSession()
  if (!g.ok) return g.error
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  if (!reportText.trim()) return fail("There is no report content to simplify.")
  try {
    const summary = await mistralChat(
      [
        {
          role: "system",
          content:
            (lang ? `Write your entire response in ${lang === "de" ? "German" : "English"}, including every heading. ` : "") +
            "Explain the following medical report in simple, easy-to-understand language for a patient with no medical " +
            "background. Avoid technical terms, or explain them briefly in brackets. " +
            "Keep the tone calm and matter-of-fact. Structure it briefly under short headings — what was found, what " +
            "it means, and what happens next — with the headings written in the response language. " +
            "Do not format the response as a letter: no salutation, no closing, no sign-off or signature, and never " +
            "output placeholder text in square brackets (such as [Ihr Arzt] or [Your doctor]). " +
            "Do not invent anything: explain only what is in the report; give no new diagnoses or treatment " +
            "recommendations. Address the person directly. " +
            directiveFor(lang),
        },
        { role: "user", content: reportText.slice(0, 6000) },
      ],
      { temperature: 0.3 },
    )
    return ok({ summary: summary.trim() })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Simplification failed.")
  }
}

/**
 * Speaker attribution for the consultation voice scribe (Feature 9). Takes the
 * raw, unlabeled speech-to-text transcript of a German consultation and splits
 * it into "Arzt:" / "Patient:" turns by reasoning over the content — no acoustic
 * diariser required. Pure segmentation: no content is invented or summarised.
 */
export async function diarizeTranscript(
  rawTranscript: string,
  lang: "de" | "en" = "de",
): Promise<ActionResult<{ transcript: string }>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  const raw = rawTranscript.trim()
  if (!raw) return fail("There is nothing to transcribe yet.")

  const system =
    lang === "en"
      ? "You receive the raw, unstructured speech-to-text transcript of a doctor–patient consultation in English, " +
        "with no speaker labels. Split it into alternating turns and label each as \"Doctor:\" (asks questions, " +
        "examines, explains, advises) or \"Patient:\" (describes symptoms, answers questions). Rules: output ONLY " +
        "the labelled transcript, one turn per line, in English. Do not add, invent, summarise, or translate the " +
        "content — only segment and label what is present. Merge consecutive sentences from the same speaker into one turn."
      : "Du erhältst das rohe, unstrukturierte Transkript (Speech-to-Text) eines Arzt-Patienten-Gesprächs auf " +
        "Deutsch, ganz ohne Sprecherkennzeichnung. Teile den Text in abwechselnde Gesprächsbeiträge auf und " +
        "kennzeichne jeden Beitrag mit „Arzt:“ (stellt Fragen, untersucht, erklärt, berät) oder „Patient:“ " +
        "(schildert Beschwerden, beantwortet Fragen). Regeln: Gib NUR das gekennzeichnete Transkript aus, einen " +
        "Beitrag pro Zeile, auf Deutsch. Füge nichts hinzu, erfinde nichts, fasse nichts zusammen und übersetze " +
        "nicht — segmentiere und kennzeichne ausschließlich den vorhandenen Text. Fasse aufeinanderfolgende Sätze " +
        "desselben Sprechers zu einem Beitrag zusammen."
  const inLabel = lang === "en" ? "Raw transcript" : "Rohes Transkript"
  const outLabel = lang === "en" ? "Labelled transcript" : "Gekennzeichnetes Transkript"

  try {
    const labelled = await mistralChat(
      [
        { role: "system", content: system },
        { role: "user", content: `${inLabel}:\n${raw.slice(0, 8000)}\n\n${outLabel}:` },
      ],
      { temperature: 0 },
    )
    const text = labelled.trim()
    if (!text) return fail("Could not process the transcript.")
    return ok({ transcript: text })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Transcription assistant unavailable.")
  }
}

/**
 * Triage classification for sick-leave recovery (Feature 18). Classifies each
 * appointment's urgency from its visit reason so the recovery optimizer can
 * prioritize urgent patients for scarce slots. The receptionist can override.
 * Falls back to "medium" without the model. Pure classification — the actual
 * reassignment stays deterministic.
 */
export async function classifyUrgency(
  items: { id: string; reason: string | null }[],
): Promise<Record<string, UrgencyLevel>> {
  const result: Record<string, UrgencyLevel> = {}
  for (const it of items) result[it.id] = "medium"
  const g = await requireStaff()
  if (!g.ok) return result // non-staff get the safe default; no LLM call
  if (!isLlmConfigured() || items.length === 0) return result
  try {
    const list = items.map((it) => `(${it.id}) ${it.reason?.trim() || "—"}`).join("\n")
    const raw = await mistralChat(
      [
        {
          role: "system",
          content:
            "Du bist eine medizinische Triage-Hilfe. Stufe jeden Termin allein anhand des Besuchsgrundes nach " +
            "Dringlichkeit ein: \"high\" (akut/dringend, z. B. starke Schmerzen, Verdacht auf ernste Erkrankung, " +
            "wichtige Verlaufskontrolle), \"medium\" (übliche Beschwerden/Kontrolle), \"routine\" " +
            "(Vorsorge/Routine/Bagatelle). Erfinde nichts. " +
            'Antworte ausschließlich als JSON: {"levels":[{"id":"...","urgency":"high|medium|routine"}]}.',
        },
        { role: "user", content: `Termine:\n${list}` },
      ],
      { json: true, temperature: 0 },
    )
    const parsed = JSON.parse(raw) as { levels?: { id?: string; urgency?: string }[] }
    for (const l of parsed.levels ?? []) {
      if (l.id && (l.urgency === "high" || l.urgency === "medium" || l.urgency === "routine")) {
        result[l.id] = l.urgency
      }
    }
  } catch { /* keep defaults */ }
  return result
}

/**
 * Doctor-facing pre-consultation briefing (Feature 12): summarize the patient's
 * history and the course of previous appointments before the doctor sees them.
 * Strictly grounded in the supplied data — recurring problems, the last visit's
 * outcome, relevant chronic conditions/allergies/medication, and what to watch.
 */
export async function summarizePatientHistory(input: {
  conditions: string[]
  allergies: string[]
  medications: string[]
  vitals?: string | null
  visits: { date: string; reason: string | null; status: string; diagnosis: string | null }[]
  lang?: UiAiLang
}): Promise<ActionResult<{ summary: string }>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  if (input.visits.length === 0 && input.conditions.length === 0 && input.medications.length === 0) {
    return fail("Not enough history to summarize for this patient.")
  }
  try {
    const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB")
    const visitsBlock = input.visits.length
      ? input.visits
          .map((v) => `- ${fmtDate(v.date)} | ${v.status} | ${v.reason ?? "—"}${v.diagnosis ? ` | Diagnosis: ${v.diagnosis}` : ""}`)
          .join("\n")
      : "No previous appointments."
    const ctxBlock = [
      input.conditions.length ? `Pre-existing conditions: ${input.conditions.join(", ")}` : "",
      input.allergies.length ? `Allergies: ${input.allergies.join(", ")}` : "",
      input.medications.length ? `Long-term medication: ${input.medications.join(", ")}` : "",
      input.vitals ? `Latest vitals: ${input.vitals}` : "",
    ].filter(Boolean).join("\n")
    const summary = await mistralChat(
      [
        {
          role: "system",
          content:
            "You are a clinical assistant. Summarize the patient's medical history for the treating doctor BEFORE " +
            "the consultation, briefly and factually. " +
            "Cover: recurring problems and their course, the outcome of the last visit, relevant chronic " +
            "diagnoses, allergies and medication, and what to pay particular attention to today. " +
            "Use ONLY the supplied data; do not invent findings or diagnoses. " +
            "Keep it short: at most about six bullet points. " +
            directiveFor(input.lang),
        },
        {
          role: "user",
          content:
            (ctxBlock ? `${ctxBlock}\n\n` : "") +
            `Previous appointments (most recent first):\n${visitsBlock}`,
        },
      ],
      { temperature: 0.3 },
    )
    return ok({ summary: summary.trim() })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "History summary failed.")
  }
}

/**
 * Profile-update suggestions (Feature 10 / AI-Module-15). After a consultation,
 * scan the report/notes for patient-profile data that is new or changed versus
 * what's on file (a newly discovered allergy, a moved address, a new phone …),
 * so the doctor can confirm them. Strictly grounded: only data explicitly stated
 * in the text, only whitelisted fields, never invented.
 */
const PROFILE_FIELDS = ["phone", "email", "street", "city", "postal_code", "country", "allergy", "condition"] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]
export type ProfileOperation = "set" | "add" | "remove"
export interface ProfileUpdateSuggestion {
  field: ProfileField
  /** set = change master data; add/remove = list entry (allergy, condition). */
  operation: ProfileOperation
  label: string
  currentValue: string | null
  proposedValue: string
  reason: string
}
export async function suggestProfileUpdates(input: {
  reportText?: string
  notes?: string
  current: {
    phone?: string | null; email?: string | null
    street?: string | null; city?: string | null; postal_code?: string | null; country?: string | null
    allergies?: string[]; conditions?: string[]
  }
}): Promise<ActionResult<{ suggestions: ProfileUpdateSuggestion[] }>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  const text = `${input.reportText ?? ""}\n${input.notes ?? ""}`.trim()
  if (!isLlmConfigured()) return ok({ suggestions: [] })
  if (!text) return ok({ suggestions: [] })
  const c = input.current
  try {
    const currentBlock =
      `Phone: ${c.phone || "—"}\nEmail: ${c.email || "—"}\n` +
      `Address: ${[c.street, c.postal_code, c.city, c.country].filter(Boolean).join(", ") || "—"}\n` +
      `Allergies: ${c.allergies?.length ? c.allergies.join(", ") : "—"}\n` +
      `Pre-existing conditions: ${c.conditions?.length ? c.conditions.join(", ") : "—"}`
    const raw = await mistralChat(
      [
        {
          role: "system",
          content:
            "You check whether a consultation text implies that MASTER DATA in the patient record should be changed. " +
            "Return ONLY changes EXPLICITLY stated in the text. Each change carries an 'operation': " +
            "'set' to change administrative data (phone, email, street, city, postal_code, country) to a new value that differs from the current one; " +
            "'add' when the text states a NEW allergy or chronic condition that is not already on file; " +
            "'remove' when the text explicitly states that an existing allergy or condition no longer applies (e.g. tolerance confirmed, diagnosis ruled out or resolved) AND it is currently on file. " +
            "Use EXACTLY these singular field keys: phone, email, street, city, postal_code, country, allergy, condition. " +
            "Never use 'allergies', 'conditions', or a combined 'address' — for an address change, output separate street, city and postal_code entries. " +
            "For a 'remove', proposedValue must be the exact entry as it appears in the current list. " +
            "Do not treat acute symptoms as a condition. Invent nothing; when in doubt, leave it out. " +
            'Respond ONLY as JSON: {"updates":[{"field":"...","operation":"set|add|remove","proposedValue":"...","reason":"short, from where in the text"}]}. ' +
            "Empty list when nothing is unambiguous. " +
            languageDirective(),
        },
        { role: "user", content: `CURRENT MASTER DATA:\n${currentBlock}\n\nCONSULTATION TEXT:\n${text.slice(0, 6000)}` },
      ],
      { json: true, temperature: 0 },
    )
    const parsed = JSON.parse(raw) as {
      updates?: { field?: string; operation?: string; proposedValue?: string; reason?: string }[]
    }

    const currentMap: Record<string, string | null | undefined> = {
      phone: c.phone, email: c.email, street: c.street, city: c.city, postal_code: c.postal_code, country: c.country,
    }
    const allergiesL = (c.allergies ?? []).map((a) => a.toLowerCase().trim())
    const conditionsL = (c.conditions ?? []).map((x) => x.toLowerCase().trim())
    const labels: Record<ProfileField, string> = {
      phone: "Phone", email: "Email", street: "Street", city: "City",
      postal_code: "Postal code", country: "Country", allergy: "Allergy", condition: "Condition",
    }

    // The model occasionally returns a plural or synonym field name; map the
    // common variants onto the canonical keys before the whitelist check.
    const FIELD_ALIASES: Record<string, ProfileField> = {
      allergies: "allergy", allergy: "allergy",
      conditions: "condition", condition: "condition", diagnosis: "condition",
      telephone: "phone", phone_number: "phone", mobile: "phone", phone: "phone",
      "e-mail": "email", email: "email",
      street: "street", address_line: "street",
      city: "city", town: "city",
      postal_code: "postal_code", postalcode: "postal_code", zip: "postal_code", plz: "postal_code", postcode: "postal_code",
      country: "country",
    }

    const out: ProfileUpdateSuggestion[] = []
    const seen = new Set<string>()
    for (const u of parsed.updates ?? []) {
      const rawField = (u.field ?? "").trim().toLowerCase()
      const field = (FIELD_ALIASES[rawField] ?? rawField) as ProfileField
      const value = (u.proposedValue ?? "").trim()
      if (!PROFILE_FIELDS.includes(field) || !value) continue
      const isClinical = field === "allergy" || field === "condition"
      // Administrative fields only ever change ('set'); clinical list entries are
      // added or removed. Coerce the model's operation into what the field allows.
      const rawOp = (u.operation ?? "").trim().toLowerCase()
      const operation: ProfileOperation = !isClinical
        ? "set"
        : rawOp === "remove" ? "remove" : "add"
      const list = field === "allergy" ? allergiesL : conditionsL

      if (operation === "set") {
        // Skip a value that already matches what's on file.
        if ((currentMap[field] ?? "").toLowerCase() === value.toLowerCase()) continue
      } else if (operation === "add") {
        // Skip a list entry that already exists.
        if (list.includes(value.toLowerCase())) continue
      } else {
        // remove: only propose removing an entry that is actually on file.
        if (!list.includes(value.toLowerCase())) continue
      }

      const key = `${field}|${operation}|${value.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        field,
        operation,
        label: labels[field],
        // For a removal the current value is the entry being removed.
        currentValue: operation === "remove" ? value : field in currentMap ? (currentMap[field] ?? null) : null,
        proposedValue: value,
        reason: (u.reason ?? "").trim(),
      })
    }
    // Temporary diagnostic: model output vs. what survived parsing/filtering.
    if (process.env.NODE_ENV !== "production") {
      console.log("[suggestProfileUpdates] model raw:", raw)
      console.log("[suggestProfileUpdates] kept:", JSON.stringify(out))
    }
    return ok({ suggestions: out })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Profile-update scan failed.")
  }
}

/**
 * Clinical decision support (Feature 13, REQ-AI-03): a guideline-grounded RAG
 * assistant for the doctor. Retrieves relevant chunks from the BGE pgvector
 * collection (read-only) and asks Mistral to answer using only those excerpts,
 * with [n] citations. It is decision support, not a decision: it never issues a
 * definitive diagnosis/therapy and defers to the doctor's judgement. Kept behind
 * lib/rag/retrieve.ts so the real RAG retrieval/embedder drops in unchanged.
 */
export interface DecisionSource { title: string | null; page: number | null; source: string | null; snippet: string }
export interface PatientContext {
  ageYears?: number | null
  allergies?: string[]
  conditions?: string[]
  medications?: string[]
  vitals?: string | null
  /** Condensed previous-visit course (date · status · diagnosis). */
  history?: string | null
}
export async function askDecisionSupport(input: {
  question: string
  notes?: string
  diagnosis?: string
  patient?: PatientContext
  history?: { role: "user" | "assistant"; content: string }[]
  lang?: UiAiLang
}): Promise<ActionResult<{ answer: string; sources: DecisionSource[]; via: string; grounded: boolean }>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  if (!input.question.trim()) return fail("Please type a clinical question.")
  try {
    // Retrieve guideline context (query enriched with the working diagnosis).
    const retrieval = await retrieveChunks(`${input.question} ${input.diagnosis ?? ""}`.trim(), 6)
    const chunks = retrieval.chunks
    const context = chunks.length
      ? chunks
          .map((c, i) => `[${i + 1}] ${c.title ?? "Guideline"}${c.page ? `, p. ${c.page}` : ""}\n${c.document.slice(0, 1200)}`)
          .join("\n\n")
      : "(no matching guideline excerpts found)"

    const p = input.patient
    const patientBlock = p
      ? [
          "PATIENT CONTEXT (current consultation):",
          p.ageYears != null ? `Age: ${p.ageYears} years` : "",
          `Allergies: ${p.allergies?.length ? p.allergies.join(", ") : "none documented"}`,
          p.conditions?.length ? `Pre-existing conditions: ${p.conditions.join(", ")}` : "",
          p.medications?.length ? `Long-term medication: ${p.medications.join(", ")}` : "",
          p.vitals ? `Vitals: ${p.vitals}` : "",
          p.history ? `Previous visits (course): ${p.history}` : "",
        ].filter(Boolean).join("\n")
      : ""

    const recent = (input.history ?? []).slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }))
    const answer = await mistralChat(
      [
        {
          role: "system",
          content:
            "You are a clinical decision-support assistant for general practitioners. Support the doctor with " +
            "case-specific, practical guidance; you never make the final decision. Draw on your sources in this order:\n" +
            "1. GUIDELINE EXCERPTS (CONTEXT): treat these as the primary, authoritative source. When you use one, " +
            "cite it in the text with [1], [2] etc. matching the CONTEXT numbering. Do not use [n] markers when there " +
            "are no excerpts.\n" +
            "2. PATIENT CONTEXT: always reason about this specific patient. If the question concerns a medication or " +
            "treatment, actively check it against the patient's allergies, pre-existing conditions, long-term " +
            "medication, interactions and contraindications, and warn clearly about any risk. This patient-specific " +
            "safety check applies even when the guideline excerpts do not mention it.\n" +
            "3. If the guideline excerpts do not answer the question, you MAY answer from well-established medical " +
            "knowledge and the AWMF guidelines. In that case you MUST clearly mark that part, for example begin it " +
            "with 'Not in the retrieved guidelines — based on general medical/AWMF knowledge:'. Stay at the level of " +
            "established consensus, be conservative, and do not invent specific doses, figures or study results.\n" +
            "Make no final diagnostic or therapeutic decision — the decision is the doctor's. Be transparent about " +
            "which source each part of the answer comes from. Answer professionally, structured and concise. " +
            directiveFor(input.lang),
        },
        ...recent,
        {
          role: "user",
          content:
            `Question: ${input.question}\n\n` +
            (patientBlock ? `${patientBlock}\n\n` : "") +
            (input.diagnosis?.trim() ? `Working diagnosis: ${input.diagnosis}\n` : "") +
            (input.notes?.trim() ? `Consultation notes:\n${input.notes.slice(0, 2000)}\n` : "") +
            `\nCONTEXT (guideline excerpts):\n${context}`,
        },
      ],
      { temperature: 0.2 },
    )

    // Keep sources 1:1 (in order) with the [1], [2]… numbering the model was
    // given, so each citation in the answer maps to the matching entry below.
    // Each carries a short snippet of the cited paragraph.
    const sources: DecisionSource[] = chunks.map((c) => ({
      title: c.title,
      page: c.page,
      source: c.source,
      snippet: c.document.replace(/\s+/g, " ").trim().slice(0, 200),
    }))
    // If nothing was retrieved, the model may invent [n] markers with no source
    // behind them — strip them so the answer doesn't show dangling numbers.
    const finalAnswer = chunks.length === 0 ? answer.trim().replace(/\s*\[\d+\]/g, "") : answer.trim()
    return ok({ answer: finalAnswer, sources, via: retrieval.via, grounded: chunks.length > 0 })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Decision support is unavailable right now.")
  }
}

/**
 * Real-time safety check (Feature 13 — REQ-AI-04). Reviews what the doctor is
 * about to commit (prescriptions + working diagnosis) against the patient's
 * allergies, conditions and current medication, and surfaces alerts the doctor
 * can heed or dismiss. Two layers, conservative by design:
 *   1. A deterministic allergy name-match — always caught, never hallucinated.
 *   2. A Mistral pass for class-level allergies, contraindications, interactions
 *      and duplicate therapy, instructed to flag only clear, well-established
 *      issues supported by the data (empty list when unsure).
 */
export async function checkPrescriptionSafety(input: {
  allergies: string[]
  conditions: string[]
  currentMedications: string[]
  prescriptions: { medication: string; dosage?: string; frequency?: string }[]
  diagnosis?: string
}): Promise<ActionResult<{ alerts: SafetyAlert[] }>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  const { t, locale } = await getT()
  const rx = input.prescriptions.filter((p) => p.medication.trim())
  if (rx.length === 0 && !input.diagnosis?.trim()) return ok({ alerts: [] })

  // 1) Deterministic allergy name-match (guaranteed, no model), localized.
  const deterministic: SafetyAlert[] = matchAllergyAlerts(input.allergies, rx, t)

  if (!isLlmConfigured()) return ok({ alerts: deterministic })

  try {
    const payload =
      `Allergies: ${input.allergies.length ? input.allergies.join(", ") : "none documented"}\n` +
      `Conditions: ${input.conditions.length ? input.conditions.join(", ") : "none"}\n` +
      `Current long-term medication: ${input.currentMedications.length ? input.currentMedications.join(", ") : "none"}\n` +
      `Working diagnosis: ${input.diagnosis?.trim() || "—"}\n` +
      `Medications being prescribed now: ${rx.map((p) => `${p.medication} ${p.dosage ?? ""} ${p.frequency ?? ""}`.trim()).join("; ") || "none"}`
    const raw = await mistralChat(
      [
        {
          role: "system",
          content:
            "You are a clinical safety checker for a GP. Review the medications the doctor is about to prescribe " +
            "against the patient's allergies, conditions and current medication. Flag ONLY clear, well-established " +
            "safety problems directly supported by the data: (1) a prescribed drug the patient is allergic to or " +
            "that belongs to that allergy's drug class (e.g. amoxicillin under a penicillin allergy); (2) a clear " +
            "contraindication given a listed condition; (3) a well-known dangerous drug–drug interaction with a " +
            "current medication; (4) obvious duplicate therapy. Be conservative: if you are not confident it is a " +
            "real, well-known issue, do NOT flag it. Never invent allergies, conditions or interactions. " +
            'Respond ONLY as JSON: {"alerts":[{"severity":"high|medium|low","category":"allergy|interaction|contraindication|dosing|duplicate|other","medication":"name","message":"short, specific, actionable"}]}. ' +
            "Empty list if nothing is clearly wrong. " +
            directiveFor(locale),
        },
        { role: "user", content: payload },
      ],
      { json: true, temperature: 0 },
    )
    const parsed = JSON.parse(raw) as { alerts?: SafetyAlert[] }
    const llm = (parsed.alerts ?? []).filter((a) => a && a.message?.trim())

    // Merge with the deterministic catches and de-duplicate by message.
    const seen = new Set<string>()
    const out: SafetyAlert[] = []
    for (const a of [...deterministic, ...llm]) {
      const key = a.message.toLowerCase().slice(0, 80)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        severity: a.severity === "high" || a.severity === "medium" || a.severity === "low" ? a.severity : "medium",
        category: a.category ?? "other",
        medication: a.medication ?? null,
        message: a.message.trim(),
      })
    }
    return ok({ alerts: out })
  } catch {
    // If the model call fails, still return the guaranteed allergy catches.
    return ok({ alerts: deterministic })
  }
}

/**
 * Doctor on-demand Q&A over the patient's own records (Feature 17). A
 * conversational RAG, strictly sandboxed to the active patient (REQ-DQ-02): it
 * answers only from that patient's past consultation reports, cites the source
 * report for every assertion (REQ-DQ-04), keeps session context (REQ-DQ-01), and
 * says so when the answer isn't in the records (REQ-DQ-05). Low temperature to
 * minimise hallucination (REQ-DQ-03). Retrieval is a simple recency fetch for
 * now; the real RAG plugs in here later, returning the same shape.
 */
export interface RecordSource { id: string; label: string }
export async function askPatientRecordsQA(input: {
  patientId: string
  question: string
  history?: { role: "user" | "assistant"; content: string }[]
  lang?: UiAiLang
}): Promise<ActionResult<{ answer: string; sources: RecordSource[]; grounded: boolean }>> {
  // Doctor-only clinical tool — a patient must never read another patient's records.
  const g = await requireDoctor()
  if (!g.ok) return g.error
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  if (!input.patientId) return fail("Missing patient.")
  if (!input.question.trim()) return fail("Please type a question.")
  try {
    // Sandboxed to this patient only (REQ-DQ-02).
    const [reports, vitalsRows] = await Promise.all([
      getReportsByPatient(input.patientId),
      getVitalsByPatient(input.patientId),
    ])
    if (reports.length === 0 && vitalsRows.length === 0) {
      return ok({ answer: "There are no records on file for this patient yet.", sources: [], grounded: false })
    }

    const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB")
    const used = reports.slice(0, 12)
    const sources: RecordSource[] = used.map((r, i) => ({
      id: r.id,
      label: `[${i + 1}] Report of ${fmtDate(r.created_at)}${r.diagnosis ? ` — ${r.diagnosis}` : ""}`,
    }))
    const reportContext = used
      .map((r, i) => {
        const body = (r.formatted_report || r.raw_notes || "").slice(0, 1000)
        const rx = (r.prescriptions ?? []).map((p) => `${p.medication} ${p.dosage ?? ""} ${p.frequency ?? ""}`.trim()).join("; ")
        return `[${i + 1}] Report of ${fmtDate(r.created_at)}${r.diagnosis ? ` — Diagnosis: ${r.diagnosis}` : ""}\n${body}${rx ? `\nPrescriptions: ${rx}` : ""}`
      })
      .join("\n\n")

    // Vitals history (most recent first) so the doctor can ask e.g. "last blood pressure?".
    const vitalsBlock = vitalsRows
      .slice(0, 10)
      .map((v) => `${fmtDate(v.recorded_at)}: ${fmtVitals(v) || "—"}`)
      .join("\n")
    const context =
      (reportContext ? `REPORTS:\n${reportContext}` : "") +
      (vitalsBlock ? `${reportContext ? "\n\n" : ""}VITALS (history, most recent first):\n${vitalsBlock}` : "")

    const recent = (input.history ?? []).slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }))
    const answer = await mistralChat(
      [
        {
          role: "system",
          content:
            "You are a clinical research assistant for the treating doctor. " +
            "Answer the question EXCLUSIVELY on the basis of the provided RECORDS of this one patient (CONTEXT). " +
            "For every statement, cite the source with [1], [2] etc. (matching the reports in the CONTEXT). " +
            "If the information is NOT in the records, say so explicitly: that nothing on this is found in this " +
            "patient's records — do not guess or invent. Stay factual and concise. " +
            directiveFor(input.lang),
        },
        ...recent,
        { role: "user", content: `Question: ${input.question}\n\nCONTEXT (this patient's records, most recent first):\n${context}` },
      ],
      { temperature: 0.1 },
    )
    return ok({ answer: answer.trim(), sources, grounded: true })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Records assistant is unavailable right now.")
  }
}

/**
 * Clinic FAQ assistant (Feature 16, REQ-FAQ-01): answers patient questions about
 * the practice grounded strictly in CLINIC_FAQ. Never gives medical advice and
 * defers to reception for anything outside the facts. Conversational — recent
 * turns are passed back as context.
 */
export async function askClinicFaq(
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<ActionResult<{ answer: string }>> {
  const g = await requireSession()
  if (!g.ok) return g.error
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  if (!question.trim()) return fail("Please type a question.")
  try {
    const recent = history.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }))
    const answer = await mistralChat(
      [
        {
          role: "system",
          content:
            `You are the friendly virtual assistant of ${CLINIC.name}. Answer patient questions about the clinic ` +
            `using ONLY the FACTS below.\n` +
            `Rules:\n` +
            `- If the answer is not in the facts, say you don't have that information and suggest contacting reception (${CLINIC.line2}).\n` +
            `- Never give medical advice, diagnoses, or interpret symptoms or results. For medical concerns, advise contacting the practice; in an emergency, tell them to call 112.\n` +
            `- Be concise, warm and clear. Use short sentences and bullet points where helpful.\n` +
            `- ${languageDirective()}\n\n` +
            `FACTS:\n${CLINIC_FAQ}`,
        },
        ...recent,
        { role: "user", content: question.slice(0, 1000) },
      ],
      { temperature: 0.2 },
    )
    return ok({ answer: answer.trim() })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The assistant is unavailable right now.")
  }
}

// Hausärztliche base GOPs that apply to almost every GKV visit — always offered
// as candidates so the model considers the Versicherten-/Chroniker-/Gesprächs-
// pauschalen rather than reaching for unrelated chapters.
const EBM_BASE = ["03001", "03002", "03003", "03004", "03005", "03220", "03221", "03230"]

/** Retrieve relevant EBM candidate codes: GP base set + codes matching the
 *  billable services extracted from the report. */
async function buildEbmCandidates(reportText: string): Promise<CodeSuggestion[]> {
  const pool = new Map<string, CodeSuggestion>()
  const addEbm = (code: string) => {
    if (pool.has(code)) return
    const e = getEbmCode(code)
    if (e) pool.set(e.code, { catalog: "EBM", code: e.code, description: e.description, points: e.points, defaultMultiplier: null })
  }
  EBM_BASE.forEach(addEbm)

  for (const phrase of await extractServices(reportText)) {
    for (const e of searchEbmCodes(phrase, 6)) addEbm(e.code)
  }
  return [...pool.values()].slice(0, 40)
}

/** Ask the model for the billable services in the report (short German phrases). */
async function extractServices(reportText: string): Promise<string[]> {
  try {
    const raw = await mistralChat(
      [
        {
          role: "system",
          content:
            'Extrahiere aus dem Arztbericht die abrechenbaren ärztlichen Leistungen als kurze deutsche Stichworte ' +
            '(z. B. "ärztliches Gespräch", "Ruhe-EKG", "körperliche Untersuchung", "Betreuung chronische Erkrankung"). ' +
            'Antworte ausschließlich als JSON: {"services":["..."]}.',
        },
        { role: "user", content: reportText.slice(0, 6000) },
      ],
      { json: true, temperature: 0 },
    )
    const parsed = JSON.parse(raw) as { services?: string[] }
    return (parsed.services ?? []).filter((s) => typeof s === "string" && s.trim().length > 1)
  } catch {
    return []
  }
}

/** The full (small) GOÄ catalog as candidates. */
async function loadGoaeCandidates(): Promise<CodeSuggestion[]> {
  const rows = await sql<{ code: string; description: string; base_cents: number; default_multiplier: string }>`
    SELECT code, description, base_cents, default_multiplier FROM goae_catalog ORDER BY code`
  return rows.map((g) => ({
    catalog: "GOAE" as const,
    code: g.code,
    description: g.description,
    points: Math.round(g.base_cents / 5.82873),
    defaultMultiplier: Number(g.default_multiplier),
  }))
}
