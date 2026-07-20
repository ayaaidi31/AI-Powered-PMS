/**
 * Doctor portal layout.
 *
 * Server Component: resolves the signed-in doctor (stand-in until auth) and
 * passes their display details to the interactive shell, which renders the
 * sidebar and top bar.
 */
import { getCurrentDoctor } from "@/lib/queries"
import { doctorName, initials } from "@/lib/display"
import { getLocale } from "@/lib/i18n/server"
import { messages } from "@/lib/i18n/messages"
import { LocaleProvider } from "@/lib/i18n/locale-context"
import { DoctorShell } from "./doctor-shell"

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const [doctor, locale] = await Promise.all([getCurrentDoctor(), getLocale()])
  const profile = doctor
    ? {
        id: doctor.id,
        name: doctorName(doctor),
        firstName: doctor.first_name,
        specialization: doctor.specialization ?? "",
        email: doctor.email,
        initials: initials(doctor.first_name, doctor.last_name),
        isAvailable: doctor.is_available,
      }
    : { id: "", name: "Doctor", firstName: "Doctor", specialization: "", email: "", initials: "DR", isAvailable: true }

  return (
    <LocaleProvider locale={locale} dict={messages[locale]}>
      <DoctorShell profile={profile}>{children}</DoctorShell>
    </LocaleProvider>
  )
}
