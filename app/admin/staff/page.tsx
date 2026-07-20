/**
 * Admin — create staff accounts (doctor / receptionist). Admin-only; the proxy
 * guards the /admin area. Provisioning issues a one-time temporary password the
 * new staff member must change on first login.
 */
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { getLocale } from "@/lib/i18n/server"
import { messages } from "@/lib/i18n/messages"
import { LocaleProvider } from "@/lib/i18n/locale-context"
import { AdminStaffClient } from "./admin-staff-client"

export const dynamic = "force-dynamic"

export default async function AdminStaffPage() {
  const session = await getSession()
  if (!session || session.role !== "admin") redirect("/")
  const locale = await getLocale()
  return (
    <LocaleProvider locale={locale} dict={messages[locale]}>
      <AdminStaffClient />
    </LocaleProvider>
  )
}
