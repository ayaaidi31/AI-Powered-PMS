/**
 * Patient — Book New Appointment (Feature 2, UC-PAT-02).
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
  // Keep on-duty doctors, plus those on a fixed-term absence (bookable again once
  // it ends). Doctors on open-ended leave (no return date) are hidden entirely.
  const bookable = doctors.filter((d) => d.is_available || d.unavailable_until)
  return <NewAppointmentClient doctors={bookable} patientId={patient.id} />
}
