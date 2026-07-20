"use server"

/**
 * Persist the chosen interface language in a cookie. Called by the language
 * switcher; the caller refreshes the route afterwards so Server Components
 * re-render in the new language.
 */
import { cookies } from "next/headers"
import { LOCALE_COOKIE, LOCALE_MAX_AGE, isLocale, type Locale } from "./config"

export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return
  ;(await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_MAX_AGE,
    sameSite: "lax",
  })
}
