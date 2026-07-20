/**
 * Doctor — My Patients.
 *
 * Server Component: lists the patients this doctor has treated, with a visit
 * summary and allergy flags, then hands them to the interactive directory.
 */
import { getCurrentDoctor, getDoctorPatients } from "@/lib/queries"
import { DoctorPatientsClient } from "./patients-client"
import { getT } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

export default async function DoctorPatientsPage() {
  const { t } = await getT()
  const doctor = await getCurrentDoctor()
  if (!doctor) {
    return <div className="p-8 text-muted-foreground">{t("patients.noDoctorAccount")}</div>
  }
  const patients = await getDoctorPatients(doctor.id)
  return <DoctorPatientsClient patients={patients} />
}
