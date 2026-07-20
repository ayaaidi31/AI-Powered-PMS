"use client"

/**
 * Client-side language access. The server layout resolves the active locale and
 * its message dictionary and passes both to LocaleProvider; client components
 * then read them through useT() and useLocale(). Only the active dictionary is
 * sent to the browser, not every locale.
 */
import { createContext, useCallback, useContext, useMemo } from "react"
import { DEFAULT_LOCALE, type Locale } from "./config"
import { messages, type Messages } from "./messages"
import { translate, type TFunction, type TVars } from "./translate"

interface LocaleContextValue {
  locale: Locale
  dict: Messages
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  dict: messages[DEFAULT_LOCALE],
})

export function LocaleProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale
  dict: Messages
  children: React.ReactNode
}) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale
}

/** Translation function bound to the active locale. */
export function useT(): TFunction {
  const { dict } = useContext(LocaleContext)
  return useCallback<TFunction>((key, vars?: TVars) => translate(dict, key, vars), [dict])
}
