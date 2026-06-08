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
