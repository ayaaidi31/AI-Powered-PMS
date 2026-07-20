/**
 * Patient portal layout.
 *
 * Server Component: resolves the signed-in patient and passes their display name
 * to the interactive shell (nav, notifications, logout).
 */
import { getCurrentPatient } from "@/lib/queries"
import { patientName } from "@/lib/display"
import { getLocale } from "@/lib/i18n/server"
import { messages } from "@/lib/i18n/messages"
import { LocaleProvider } from "@/lib/i18n/locale-context"
import { PatientShell } from "./patient-shell"

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const [patient, locale] = await Promise.all([getCurrentPatient(), getLocale()])
  const fullName = patient ? patientName(patient) : "Patient"
  const firstName = patient?.first_name ?? "Patient"
  return (
    <LocaleProvider locale={locale} dict={messages[locale]}>
      <PatientShell patientName={fullName} firstName={firstName}>
        {children}
      </PatientShell>
    </LocaleProvider>
  )
}
