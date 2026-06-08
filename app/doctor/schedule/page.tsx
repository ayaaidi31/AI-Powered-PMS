/**
 * Doctor — Schedule.
 *
 * Server Component: loads the doctor's appointments and the set of patients with
 * allergies, then hands them to the day-navigable schedule view.
 */
import {
  getCurrentDoctor, getAppointmentsByDoctor, getPatientIdsWithAllergies,
} from "@/lib/queries"
import { DoctorScheduleClient } from "./schedule-client"

export const dynamic = "force-dynamic"

export default async function DoctorSchedulePage() {
  const doctor = await getCurrentDoctor()
  if (!doctor) {
    return <div className="p-8 text-muted-foreground">No doctor account found.</div>
  }
  const [appointments, allergyIds] = await Promise.all([
    getAppointmentsByDoctor(doctor.id),
    getPatientIdsWithAllergies(),
  ])
  return <DoctorScheduleClient appointments={appointments} allergyPatientIds={[...allergyIds]} />
}
