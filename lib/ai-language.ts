/**
 * Single source of truth for the language the AI features answer in.
 *
 * The clinic is German, so the codes, catalogs and stored data stay German;
 * only the model's free-text OUTPUT is controlled here. Keeping it in one place
 * means a future language toggle (or full German/other localization) is a single
 * change rather than a sweep across every prompt.
 */
export type AiLanguage = "English" | "German"
/** Short locale code chosen at an AI feature (matches the interface locale codes). */
export type UiAiLang = "de" | "en"

export const AI_OUTPUT_LANGUAGE: AiLanguage = "English"

/** A short directive appended to prompts so the model replies in the set language. */
export function languageDirective(lang: AiLanguage = AI_OUTPUT_LANGUAGE): string {
  return lang === "German"
    ? "Antworte auf Deutsch."
    : "Always reply in English. If any source material (guidelines, records, codes) is in German, translate it faithfully into English while keeping technical terms precise."
}

/**
 * Directive for a language chosen at an AI feature ("de"/"en"). Falls back to the
 * default output language when the caller passes nothing, so existing callers are
 * unaffected.
 */
export function directiveFor(lang?: UiAiLang): string {
  if (!lang) return languageDirective()
  return languageDirective(lang === "de" ? "German" : "English")
}
