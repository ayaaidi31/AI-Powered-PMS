/**
 * Server-side language access for Server Components and Server Actions. Reads the
 * locale cookie and returns a bound translation function plus the active locale
 * (for Intl date/number formatting via INTL_LOCALE).
 */
import "server-only"
import { cookies } from "next/headers"
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config"
import { messages } from "./messages"
import { translate, type TFunction, type TVars } from "./translate"

/** The visitor's chosen interface language, or the German default. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/** Bound translator for the current request: `const { t, locale } = await getT()`. */
export async function getT(): Promise<{ t: TFunction; locale: Locale }> {
  const locale = await getLocale()
  const dict = messages[locale]
  const t: TFunction = (key, vars?: TVars) => translate(dict, key, vars)
  return { t, locale }
}
