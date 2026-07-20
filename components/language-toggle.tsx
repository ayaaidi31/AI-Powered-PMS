"use client"

/**
 * German/English interface switcher. Writes the locale cookie and refreshes the
 * route so Server Components re-render in the new language. Rendered as a compact
 * segmented control (DE | EN) with the active language highlighted.
 */
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Languages } from "lucide-react"
import { cn } from "@/lib/utils"
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n/config"
import { useLocale } from "@/lib/i18n/locale-context"
import { setLocale } from "@/lib/i18n/set-locale"

export function LanguageToggle({ className }: { className?: string }) {
  const active = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function choose(locale: Locale) {
    if (locale === active || pending) return
    startTransition(async () => {
      await setLocale(locale)
      router.refresh()
    })
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5",
        pending && "opacity-70",
        className,
      )}
      role="group"
      aria-label={LOCALE_LABEL[active]}
    >
      <Languages className="w-4 h-4 text-muted-foreground mx-1" aria-hidden />
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => choose(locale)}
          aria-pressed={locale === active}
          title={LOCALE_LABEL[locale]}
          className={cn(
            "min-w-8 rounded-md px-2 py-1 text-xs font-semibold uppercase transition-colors",
            locale === active
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {locale}
        </button>
      ))}
    </div>
  )
}
