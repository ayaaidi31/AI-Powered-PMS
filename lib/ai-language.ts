/**
 * Single source of truth for the language the AI features answer in.
 *
 * The clinic is German, so the codes, catalogs and stored data stay German;
 * only the model's free-text OUTPUT is controlled here. Keeping it in one place
 * means a future language toggle (or full German/other localization) is a single
 * change rather than a sweep across every prompt.
 */
export type AiLanguage = "English" | "German"

export const AI_OUTPUT_LANGUAGE: AiLanguage = "English"

/** A short directive appended to prompts so the model replies in the set language. */
export function languageDirective(lang: AiLanguage = AI_OUTPUT_LANGUAGE): string {
  return lang === "German"
    ? "Antworte auf Deutsch."
    : "Always reply in English. If any source material (guidelines, records, codes) is in German, translate it faithfully into English while keeping technical terms precise."
}
