/**
 * Doctor — Schedule.
 *
 * Server Component: loads the doctor's appointments and the set of patients with
 * allergies, then hands them to the day-navigable schedule view.
 */
import {
  getCurrentDoctor, getAppointmentsByDoctor, getPatientIdsWithAllergies,
} from "@/lib/queries"
import { getT } from "@/lib/i18n/server"
import { DoctorScheduleClient } from "./schedule-client"

export const dynamic = "force-dynamic"

export default async function DoctorSchedulePage() {
  const { t } = await getT()
  const doctor = await getCurrentDoctor()
  if (!doctor) {
    return <div className="p-8 text-muted-foreground">{t("schedule.noDoctorAccount")}</div>
  }
  const [appointments, allergyIds] = await Promise.all([
    getAppointmentsByDoctor(doctor.id),
    getPatientIdsWithAllergies(),
  ])
  return <DoctorScheduleClient appointments={appointments} allergyPatientIds={[...allergyIds]} />
}
