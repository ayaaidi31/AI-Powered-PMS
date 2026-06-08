/**
 * Doctor portal layout.
 *
 * Server Component: resolves the signed-in doctor (stand-in until auth) and
 * passes their display details to the interactive shell, which renders the
 * sidebar and top bar.
 */
import { getCurrentDoctor } from "@/lib/queries"
import { doctorName, initials } from "@/lib/display"
import { DoctorShell } from "./doctor-shell"

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const doctor = await getCurrentDoctor()
  const profile = doctor
    ? {
        name: doctorName(doctor),
        firstName: doctor.first_name,
        specialization: doctor.specialization ?? "",
        email: doctor.email,
        initials: initials(doctor.first_name, doctor.last_name),
      }
    : { name: "Doctor", firstName: "Doctor", specialization: "", email: "", initials: "DR" }

  return <DoctorShell profile={profile}>{children}</DoctorShell>
}
