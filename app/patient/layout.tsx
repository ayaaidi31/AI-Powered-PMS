/**
 * Patient portal layout.
 *
 * Server Component: resolves the signed-in patient and passes their display name
 * to the interactive shell (nav, notifications, logout).
 */
import { getCurrentPatient } from "@/lib/queries"
import { patientName } from "@/lib/display"
import { PatientShell } from "./patient-shell"

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const patient = await getCurrentPatient()
  const fullName = patient ? patientName(patient) : "Patient"
  const firstName = patient?.first_name ?? "Patient"
  return (
    <PatientShell patientName={fullName} firstName={firstName}>
      {children}
    </PatientShell>
  )
}
