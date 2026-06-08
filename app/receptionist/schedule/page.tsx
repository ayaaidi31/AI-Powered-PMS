/**
 * Receptionist — Weekly Schedule (Features 4, 7, 9).
 *
 * Server Component: loads all appointments (with patient/doctor display names),
 * the doctor roster, and the patient list for the booking dialog, then renders
 * the interactive calendar. Revalidated by the appointment actions.
 */
import { getAppointments, getDoctors, getPatients } from "@/lib/queries"
import { ScheduleClient } from "./schedule-client"

// Live schedule data must be fetched per request, never statically cached.
export const dynamic = "force-dynamic"

export default async function ReceptionistSchedulePage() {
  const [appointments, doctors, patients] = await Promise.all([
    getAppointments(),
    getDoctors(),
    getPatients(),
  ])
  return (
    <ScheduleClient appointments={appointments} doctors={doctors} patients={patients} />
  )
}
