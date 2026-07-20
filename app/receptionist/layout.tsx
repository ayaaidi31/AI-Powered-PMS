/**
 * Receptionist portal layout.
 *
 * Server Component: resolves the signed-in receptionist and passes their display
 * profile to the interactive shell (sidebar, notifications, settings).
 */
import { getCurrentReceptionist } from "@/lib/queries"
import { initials } from "@/lib/display"
import { getLocale } from "@/lib/i18n/server"
import { messages } from "@/lib/i18n/messages"
import { LocaleProvider } from "@/lib/i18n/locale-context"
import { ReceptionistShell } from "./receptionist-shell"

export default async function ReceptionistLayout({ children }: { children: React.ReactNode }) {
  const [r, locale] = await Promise.all([getCurrentReceptionist(), getLocale()])
  const profile = r
    ? {
        name: `${r.first_name} ${r.last_name}`,
        department: r.department ?? "Front Desk",
        email: r.email,
        initials: initials(r.first_name, r.last_name),
      }
    : { name: "Reception Staff", department: "Front Desk", email: "", initials: "RS" }

  return (
    <LocaleProvider locale={locale} dict={messages[locale]}>
      <ReceptionistShell profile={profile}>{children}</ReceptionistShell>
    </LocaleProvider>
  )
}
