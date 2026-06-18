"use server"

/**
 * AI actions (TEMPORARY Mistral layer — Features 2 & 12).
 *
 * Two model-backed steps, both kept behind lib/llm/mistral.ts so the RAG system
 * can replace them later:
 *   - generateConsultationReport: rough notes → structured German report.
 *   - suggestBillingCodes: report → billing codes, using a retrieve-then-select
 *     (RAG-lite) approach. We FIRST retrieve candidate codes from the real
 *     catalog (the GP base GOPs + EBM codes matching the services extracted from
 *     the report, or the full GOÄ table), then ask the model to SELECT only from
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
import { ok, fail, type ActionResult } from "./types"
import type { CodeSuggestion } from "./codes"

interface ReportInput {
  rawNotes: string
  diagnosis?: string
  treatment?: string
  context?: { conditions: string[]; allergies: string[]; medications: string[] }
}

/** Turn the doctor's rough notes into a structured, formal German report. */
export async function generateConsultationReport(
  input: ReportInput,
): Promise<ActionResult<{ report: string }>> {
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  if (!input.rawNotes.trim() && !input.diagnosis?.trim()) {
    return fail("Enter some notes first.")
  }

  const ctx = input.context
  const contextBlock = ctx
    ? [
        ctx.conditions.length ? `Vorerkrankungen: ${ctx.conditions.join(", ")}` : "",
        ctx.allergies.length ? `Allergien: ${ctx.allergies.join(", ")}` : "",
        ctx.medications.length ? `Aktuelle Medikation: ${ctx.medications.join(", ")}` : "",
      ].filter(Boolean).join("\n")
    : ""

  try {
    const report = await mistralChat(
      [
        {
          role: "system",
          content:
            "Du bist ein medizinischer Dokumentationsassistent. Wandle die stichwortartigen Konsultationsnotizen in einen formellen, strukturierten deutschen Arztbericht um. " +
            "Gliederung: Anamnese, Befund, Diagnose, Therapie/Procedere. " +
            "Erfinde keine Befunde, Werte oder Diagnosen, die nicht in den Notizen stehen. Nenne keine personenbezogenen Identifikatoren.",
        },
        {
          role: "user",
          content:
            (contextBlock ? `Patientenkontext:\n${contextBlock}\n\n` : "") +
            `Notizen:\n${input.rawNotes}\n` +
            (input.diagnosis ? `\nDiagnose: ${input.diagnosis}` : "") +
            (input.treatment ? `\nBehandlung: ${input.treatment}` : ""),
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
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  if (!reportText.trim()) return fail("Generate or write the report first.")

  const catalog: "EBM" | "GOAE" = insuranceType === "gkv" ? "EBM" : "GOAE"

  try {
    // 1) Build a pool of CANDIDATE codes from the real catalog (retrieval).
    const candidates =
      catalog === "EBM" ? await buildEbmCandidates(reportText) : await loadGoaeCandidates()
    if (candidates.length === 0) return ok([])

    // 2) Let the model SELECT only from those candidates. Temperature 0 makes
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
 * Extract the medications NEWLY PRESCRIBED OR CHANGED in this consultation
 * (name, dosage, frequency). The patient's existing medication is passed in so
 * the model can exclude it — only meds that are new, or whose dose changed, are
 * returned (not the ongoing Dauermedikation merely mentioned as history).
 */
export async function extractPrescriptions(
  text: string,
  currentMedications: string[] = [],
): Promise<ActionResult<{ medication: string; dosage: string; frequency: string }[]>> {
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
 * Patient-facing simplification (Feature 14, REQ-SIMP-01): rewrite a medical
 * report in plain, reassuring language a layperson can understand. Strictly
 * explanatory — it must not invent findings, diagnoses or recommendations.
 */
export async function simplifyReport(reportText: string): Promise<ActionResult<{ summary: string }>> {
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
            "Erkläre den folgenden Arztbericht in einfacher, leicht verständlicher Sprache für eine Patientin oder " +
            "einen Patienten ohne medizinische Vorkenntnisse. Vermeide Fachbegriffe oder erkläre sie kurz in Klammern. " +
            "Schreibe ruhig und sachlich. Gliedere kurz: was wurde festgestellt, was bedeutet das, und wie geht es weiter. " +
            "Erfinde nichts: erkläre ausschließlich, was im Bericht steht; gib keine neuen Diagnosen oder " +
            "Behandlungsempfehlungen. Sprich die Person direkt an („Sie“).",
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
 * Doctor-facing pre-consultation briefing (Feature 10): summarize the patient's
 * history and the course of previous appointments before the doctor sees them.
 * Strictly grounded in the supplied data — recurring problems, the last visit's
 * outcome, relevant chronic conditions/allergies/medication, and what to watch.
 */
export async function summarizePatientHistory(input: {
  conditions: string[]
  allergies: string[]
  medications: string[]
  visits: { date: string; reason: string | null; status: string; diagnosis: string | null }[]
}): Promise<ActionResult<{ summary: string }>> {
  if (!isLlmConfigured()) {
    return fail("No AI model configured. Add MISTRAL_API_KEY to .env.local.")
  }
  if (input.visits.length === 0 && input.conditions.length === 0 && input.medications.length === 0) {
    return fail("Not enough history to summarize for this patient.")
  }
  try {
    const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE")
    const visitsBlock = input.visits.length
      ? input.visits
          .map((v) => `- ${fmtDate(v.date)} | ${v.status} | ${v.reason ?? "—"}${v.diagnosis ? ` | Diagnose: ${v.diagnosis}` : ""}`)
          .join("\n")
      : "Keine früheren Termine."
    const ctxBlock = [
      input.conditions.length ? `Vorerkrankungen: ${input.conditions.join(", ")}` : "",
      input.allergies.length ? `Allergien: ${input.allergies.join(", ")}` : "",
      input.medications.length ? `Dauermedikation: ${input.medications.join(", ")}` : "",
    ].filter(Boolean).join("\n")
    const summary = await mistralChat(
      [
        {
          role: "system",
          content:
            "Du bist ein klinischer Assistent. Fasse die Krankengeschichte des Patienten für die behandelnde " +
            "Ärztin oder den behandelnden Arzt VOR der Konsultation kurz und sachlich zusammen. " +
            "Nenne: wiederkehrende Probleme und den Verlauf, das Ergebnis des letzten Besuchs, relevante " +
            "Dauerdiagnosen, Allergien und Medikation sowie worauf heute besonders zu achten ist. " +
            "Nutze AUSSCHLIESSLICH die bereitgestellten Daten; erfinde keine Befunde oder Diagnosen. " +
            "Halte dich kurz: maximal etwa sechs Stichpunkte.",
        },
        {
          role: "user",
          content:
            (ctxBlock ? `${ctxBlock}\n\n` : "") +
            `Frühere Termine (neueste zuerst):\n${visitsBlock}`,
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
 * Profile-update suggestions (Feature 15 / AI-Module-15). After a consultation,
 * scan the report/notes for patient-profile data that is NEW or CHANGED versus
 * what's on file (a newly discovered allergy, a moved address, a new phone …),
 * so the doctor can confirm them. Strictly grounded: only data explicitly stated
 * in the text, only whitelisted fields, never invented.
 */
const PROFILE_FIELDS = ["phone", "email", "street", "city", "postal_code", "country", "allergy", "condition"] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]
export interface ProfileUpdateSuggestion {
  field: ProfileField
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
  const text = `${input.reportText ?? ""}\n${input.notes ?? ""}`.trim()
  if (!isLlmConfigured()) return ok({ suggestions: [] })
  if (!text) return ok({ suggestions: [] })
  const c = input.current
  try {
    const currentBlock =
      `Telefon: ${c.phone || "—"}\nE-Mail: ${c.email || "—"}\n` +
      `Adresse: ${[c.street, c.postal_code, c.city, c.country].filter(Boolean).join(", ") || "—"}\n` +
      `Allergien: ${c.allergies?.length ? c.allergies.join(", ") : "—"}\n` +
      `Vorerkrankungen: ${c.conditions?.length ? c.conditions.join(", ") : "—"}`
    const raw = await mistralChat(
      [
        {
          role: "system",
          content:
            "Du prüfst, ob aus einem Konsultationstext STAMMDATEN der Patientenakte aktualisiert werden sollten. " +
            "Gib NUR Änderungen aus, die im Text AUSDRÜCKLICH genannt sind UND vom aktuellen Stand abweichen bzw. neu sind. " +
            "Erlaubte Felder: phone, email, street, city, postal_code, country, allergy (neue Allergie), condition (neue Dauerdiagnose). " +
            "Für allergy/condition NUR Einträge, die noch nicht in der Liste stehen. Erfinde nichts; im Zweifel weglassen. " +
            "Keine reinen Konsultationsbefunde (akute Symptome) als condition. " +
            'Antworte ausschließlich als JSON: {"updates":[{"field":"...","proposedValue":"...","reason":"kurz, woraus im Text"}]}. ' +
            "Leere Liste, wenn nichts Eindeutiges vorliegt.",
        },
        { role: "user", content: `AKTUELLE STAMMDATEN:\n${currentBlock}\n\nKONSULTATIONSTEXT:\n${text.slice(0, 6000)}` },
      ],
      { json: true, temperature: 0 },
    )
    const parsed = JSON.parse(raw) as { updates?: { field?: string; proposedValue?: string; reason?: string }[] }

    const currentMap: Record<string, string | null | undefined> = {
      phone: c.phone, email: c.email, street: c.street, city: c.city, postal_code: c.postal_code, country: c.country,
    }
    const allergiesL = (c.allergies ?? []).map((a) => a.toLowerCase().trim())
    const conditionsL = (c.conditions ?? []).map((x) => x.toLowerCase().trim())
    const labels: Record<ProfileField, string> = {
      phone: "Phone", email: "Email", street: "Street", city: "City",
      postal_code: "Postal code", country: "Country", allergy: "New allergy", condition: "New condition",
    }

    const out: ProfileUpdateSuggestion[] = []
    const seen = new Set<string>()
    for (const u of parsed.updates ?? []) {
      const field = (u.field ?? "").trim() as ProfileField
      const value = (u.proposedValue ?? "").trim()
      if (!PROFILE_FIELDS.includes(field) || !value) continue
      // Skip values that already match what's on file.
      if (field === "allergy" && allergiesL.includes(value.toLowerCase())) continue
      if (field === "condition" && conditionsL.includes(value.toLowerCase())) continue
      if (field in currentMap && (currentMap[field] ?? "").toLowerCase() === value.toLowerCase()) continue
      const key = `${field}|${value.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        field,
        label: labels[field],
        currentValue: field in currentMap ? (currentMap[field] ?? null) : null,
        proposedValue: value,
        reason: (u.reason ?? "").trim(),
      })
    }
    return ok({ suggestions: out })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Profile-update scan failed.")
  }
}

/**
 * Clinical decision support (Feature 11, REQ-AI-03): a guideline-grounded RAG
 * assistant for the doctor. Retrieves relevant chunks from the BGE pgvector
 * collection (read-only) and asks Mistral to answer using ONLY those excerpts,
 * with [n] citations. It is decision SUPPORT, not a decision: it never issues a
 * definitive diagnosis/therapy and defers to the doctor's judgement. Kept behind
 * lib/rag/retrieve.ts so the real RAG retrieval/embedder drops in unchanged.
 */
export interface DecisionSource { title: string | null; page: number | null; source: string | null }
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
}): Promise<ActionResult<{ answer: string; sources: DecisionSource[]; via: string; grounded: boolean }>> {
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
          .map((c, i) => `[${i + 1}] ${c.title ?? "Leitlinie"}${c.page ? `, S. ${c.page}` : ""}\n${c.document.slice(0, 1200)}`)
          .join("\n\n")
      : "(keine passenden Leitlinien-Auszüge gefunden)"

    const p = input.patient
    const patientBlock = p
      ? [
          "PATIENTENKONTEXT (aktuelle Konsultation):",
          p.ageYears != null ? `Alter: ${p.ageYears} Jahre` : "",
          `Allergien: ${p.allergies?.length ? p.allergies.join(", ") : "keine dokumentiert"}`,
          p.conditions?.length ? `Vorerkrankungen: ${p.conditions.join(", ")}` : "",
          p.medications?.length ? `Dauermedikation: ${p.medications.join(", ")}` : "",
          p.vitals ? `Vitalwerte: ${p.vitals}` : "",
          p.history ? `Frühere Besuche (Verlauf): ${p.history}` : "",
        ].filter(Boolean).join("\n")
      : ""

    const recent = (input.history ?? []).slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }))
    const answer = await mistralChat(
      [
        {
          role: "system",
          content:
            "Du bist ein klinisches Entscheidungsunterstützungssystem für Hausärztinnen und Hausärzte. " +
            "Beantworte die Frage AUSSCHLIESSLICH auf Basis der bereitgestellten Leitlinien-Auszüge (KONTEXT). " +
            "Zitiere die genutzten Auszüge im Text mit [1], [2] usw. " +
            "Berücksichtige den PATIENTENKONTEXT (Alter, Allergien, Vorerkrankungen, Dauermedikation, Vitalwerte, " +
            "frühere Besuche und Verlauf) und gib fallbezogene, konkrete Empfehlungen. Beziehe relevante Vorbefunde " +
            "und den bisherigen Verlauf in deine Einschätzung ein. Weise aktiv auf mögliche Sicherheitsprobleme hin " +
            "(Allergien, Kontraindikationen, Wechselwirkungen), wenn der Kontext sie nahelegt. " +
            "Wenn der KONTEXT die Frage nicht oder nur teilweise beantwortet, sage das ausdrücklich und rate nicht; " +
            "erfinde nichts. Triff KEINE endgültige Diagnose- oder Therapieentscheidung — du unterstützt nur; " +
            "die Entscheidung trifft die Ärztin oder der Arzt. Antworte fachlich, strukturiert und knapp. " +
            "Antworte in der SPRACHE DER FRAGE: Wird die Frage auf Englisch gestellt, antworte auf Englisch und " +
            "übersetze die deutschen Leitlinieninhalte sinngemäß (Fachbegriffe präzise halten).",
        },
        ...recent,
        {
          role: "user",
          content:
            `Frage: ${input.question}\n\n` +
            (patientBlock ? `${patientBlock}\n\n` : "") +
            (input.diagnosis?.trim() ? `Arbeitsdiagnose: ${input.diagnosis}\n` : "") +
            (input.notes?.trim() ? `Konsultationsnotizen:\n${input.notes.slice(0, 2000)}\n` : "") +
            `\nKONTEXT (Leitlinien-Auszüge):\n${context}`,
        },
      ],
      { temperature: 0.2 },
    )

    // De-duplicate the cited sources for display.
    const seen = new Set<string>()
    const sources: DecisionSource[] = []
    for (const c of chunks) {
      const key = `${c.title}|${c.page}`
      if (seen.has(key)) continue
      seen.add(key)
      sources.push({ title: c.title, page: c.page, source: c.source })
    }
    return ok({ answer: answer.trim(), sources, via: retrieval.via, grounded: chunks.length > 0 })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Decision support is unavailable right now.")
  }
}

/**
 * Real-time safety check (Feature 11 — REQ-AI-04). Reviews what the doctor is
 * about to commit (prescriptions + working diagnosis) against the patient's
 * allergies, conditions and current medication, and surfaces alerts the doctor
 * can heed or dismiss. Two layers, conservative by design:
 *   1. A deterministic allergy name-match — always caught, never hallucinated.
 *   2. A Mistral pass for class-level allergies, contraindications, interactions
 *      and duplicate therapy, instructed to flag ONLY clear, well-established
 *      issues supported by the data (empty list when unsure).
 */
export interface SafetyAlert {
  severity: "high" | "medium" | "low"
  category: "allergy" | "interaction" | "contraindication" | "dosing" | "duplicate" | "other"
  medication: string | null
  message: string
}
export async function checkPrescriptionSafety(input: {
  allergies: string[]
  conditions: string[]
  currentMedications: string[]
  prescriptions: { medication: string; dosage?: string; frequency?: string }[]
  diagnosis?: string
}): Promise<ActionResult<{ alerts: SafetyAlert[] }>> {
  const rx = input.prescriptions.filter((p) => p.medication.trim())
  if (rx.length === 0 && !input.diagnosis?.trim()) return ok({ alerts: [] })

  // 1) Deterministic allergy name-match (guaranteed, no model).
  const deterministic: SafetyAlert[] = []
  for (const p of rx) {
    const medL = p.medication.toLowerCase()
    for (const a of input.allergies) {
      const aL = a.toLowerCase().trim()
      if (aL.length > 2 && medL.length > 2 && (medL.includes(aL) || aL.includes(medL))) {
        deterministic.push({
          severity: "high",
          category: "allergy",
          medication: p.medication,
          message: `Documented allergy to ${a} — "${p.medication}" appears to match. Verify before prescribing.`,
        })
      }
    }
  }

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
            'Respond ONLY as JSON: {"alerts":[{"severity":"high|medium|low","category":"allergy|interaction|contraindication|dosing|duplicate|other","medication":"name","message":"short, specific, actionable, in English"}]}. ' +
            "Empty list if nothing is clearly wrong.",
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
 * Clinic FAQ assistant (Feature 13, REQ-FAQ-01): answers patient questions about
 * the practice grounded STRICTLY in CLINIC_FAQ. Never gives medical advice and
 * defers to reception for anything outside the facts. Conversational — recent
 * turns are passed back as context.
 */
export async function askClinicFaq(
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<ActionResult<{ answer: string }>> {
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
            `- Reply in the SAME language as the patient's latest message.\n\n` +
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
