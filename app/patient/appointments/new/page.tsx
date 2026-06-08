/**
 * Patient — Book New Appointment (Feature 4, UC-PAT-02).
 *
 * Server Component: loads the bookable doctor roster and resolves the current
 * patient (stand-in until authentication), then renders the booking wizard.
 */
import { getDoctors, getCurrentPatient } from "@/lib/queries"
import { NewAppointmentClient } from "./new-appointment-client"

export const dynamic = "force-dynamic"

export default async function NewAppointmentPage() {
  const [doctors, patient] = await Promise.all([getDoctors(), getCurrentPatient()])
  if (!patient) {
    return <div className="p-8 text-muted-foreground">No patient account found.</div>
  }
  const available = doctors.filter((d) => d.is_available)
  return <NewAppointmentClient doctors={available} patientId={patient.id} />
}
