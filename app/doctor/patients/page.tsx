/**
 * Doctor — My Patients.
 *
 * Server Component: lists the patients this doctor has treated, with a visit
 * summary and allergy flags, then hands them to the interactive directory.
 */
import { getCurrentDoctor, getDoctorPatients } from "@/lib/queries"
import { DoctorPatientsClient } from "./patients-client"

export const dynamic = "force-dynamic"

export default async function DoctorPatientsPage() {
  const doctor = await getCurrentDoctor()
  if (!doctor) {
    return <div className="p-8 text-muted-foreground">No doctor account found.</div>
  }
  const patients = await getDoctorPatients(doctor.id)
  return <DoctorPatientsClient patients={patients} />
}
