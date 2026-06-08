/**
 * Receptionist — Waiting Room board (Features 5/7 patient flow).
 *
 * Server Component: loads today's appointments and the set of patients with
 * recorded allergies (for the alert flag), then renders the live board.
 */
import { getAppointments, getPatientIdsWithAllergies } from "@/lib/queries"
import { WaitingClient, type WaitingAppointment } from "./waiting-client"

export const dynamic = "force-dynamic"

export default async function WaitingRoomPage() {
  const [appointments, allergyIds] = await Promise.all([
    getAppointments(),
    getPatientIdsWithAllergies(),
  ])

  const todayStr = new Date().toDateString()
  const today: WaitingAppointment[] = appointments
    .filter((a) => new Date(a.starts_at).toDateString() === todayStr)
    .map((a) => ({
      id: a.id,
      patientId: a.patient_id,
      patientName: a.patient_name,
      doctorName: a.doctor_name,
      startsAt: a.starts_at,
      checkInAt: a.check_in_at,
      status: a.status,
      reason: a.reason,
      hasAllergy: allergyIds.has(a.patient_id),
    }))

  return <WaitingClient appointments={today} />
}
