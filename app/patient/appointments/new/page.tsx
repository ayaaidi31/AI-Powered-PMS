/**
 * Patient — Book New Appointment (Feature 2, UC-PAT-02).
 *
 * Server Component: loads the bookable doctor roster and resolves the current
 * patient (stand-in until authentication), then renders the booking wizard.
 */
import { getDoctors, getCurrentPatient, getAppointmentById } from "@/lib/queries"
import { NewAppointmentClient } from "./new-appointment-client"

export const dynamic = "force-dynamic"

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ reschedule?: string }>
}) {
  const { reschedule } = await searchParams
  const [doctors, patient] = await Promise.all([getDoctors(), getCurrentPatient()])
  if (!patient) {
    return <div className="p-8 text-muted-foreground">No patient account found.</div>
  }
  // Keep on-duty doctors, plus those on a fixed-term absence (bookable again once
  // it ends). Doctors on open-ended leave (no return date) are hidden entirely.
  const bookable = doctors.filter((d) => d.is_available || d.unavailable_until)

  // Reschedule mode: load the appointment being moved, but only if it belongs to
  // this patient and is still reschedulable (scheduled). The wizard then edits it
  // in place instead of creating a new one.
  let reschedule_ctx: { id: string; doctorId: string; reason: string } | null = null
  if (reschedule) {
    const appt = await getAppointmentById(reschedule)
    if (appt && appt.patient_id === patient.id && appt.status === "scheduled") {
      reschedule_ctx = { id: appt.id, doctorId: appt.doctor_id, reason: appt.reason ?? "" }
      // Make sure the current doctor is selectable even if not in the bookable list.
      if (!bookable.some((d) => d.id === appt.doctor_id)) {
        const current = doctors.find((d) => d.id === appt.doctor_id)
        if (current) bookable.push(current)
      }
    }
  }

  return <NewAppointmentClient doctors={bookable} patientId={patient.id} reschedule={reschedule_ctx} />
}
