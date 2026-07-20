/**
 * Interface language configuration.
 *
 * The clinic is German, so German is the default interface language; English is
 * offered as a second option. The choice is a per-visitor preference stored in a
 * cookie (see set-locale.ts), not part of the URL, so no route restructuring is
 * needed. Stored data, codes and catalogs stay German regardless of this setting;
 * only the interface text and formatting react to it.
 */
export const LOCALES = ["de", "en"] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "de"
export const LOCALE_COOKIE = "locale"
/** One year — the preference persists across sessions until changed. */
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/** BCP-47 tags used for Intl date, time and number formatting. */
export const INTL_LOCALE: Record<Locale, string> = { de: "de-DE", en: "en-US" }

/** Human-readable names shown in the language switcher. */
export const LOCALE_LABEL: Record<Locale, string> = { de: "Deutsch", en: "English" }
