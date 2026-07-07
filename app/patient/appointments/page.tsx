/**
 * Patient — My Appointments (Feature 4).
 *
 * Server Component: resolves the current patient (stand-in until authentication
 * is implemented), loads their appointments joined with the doctor's name, and
 * renders the interactive list.
 */
import { getCurrentPatient, getAppointmentsByPatient, getDoctors } from "@/lib/queries"
import { doctorName } from "@/lib/display"
import { PatientAppointmentsClient, type PatientAppointmentView } from "./appointments-client"

// Live appointment data must be fetched per request, never statically cached.
export const dynamic = "force-dynamic"

export default async function PatientAppointmentsPage() {
  const patient = await getCurrentPatient()
  if (!patient) {
    return <div className="p-8 text-muted-foreground">No patient account found.</div>
  }

  const [appointments, doctors] = await Promise.all([
    getAppointmentsByPatient(patient.id),
    getDoctors(),
  ])
  const doctorNames = new Map(doctors.map((d) => [d.id, doctorName(d)]))

  // Project the rows into the minimal view the client needs.
  const view: PatientAppointmentView[] = appointments.map((a) => ({
    id: a.id,
    starts_at: a.starts_at,
    status: a.status,
    reason: a.reason,
    doctor_name: doctorNames.get(a.doctor_id) ?? "Doctor",
    check_in_code: a.check_in_code ?? null,
  }))

  return <PatientAppointmentsClient appointments={view} />
}
