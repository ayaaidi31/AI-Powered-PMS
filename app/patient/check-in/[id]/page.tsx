/**
 * Patient — Mobile Self Check-in (Feature 5, UC-PAT-01).
 *
 * Server Component: loads the scanned appointment by id and renders the mobile
 * check-in flow. The actual status transition is performed by the
 * `checkInAppointment` Server Action invoked from the client.
 */
import { getAppointmentById } from "@/lib/queries"
import { CheckInClient } from "./check-in-client"

export const dynamic = "force-dynamic"

export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const appointment = await getAppointmentById(id)
  return (
    <CheckInClient
      appointment={
        appointment && {
          id: appointment.id,
          starts_at: appointment.starts_at,
          status: appointment.status,
          reason: appointment.reason,
          doctor_name: appointment.doctor_name,
          patient_name: appointment.patient_name,
        }
      }
    />
  )
}
