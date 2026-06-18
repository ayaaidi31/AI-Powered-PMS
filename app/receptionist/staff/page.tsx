/**
 * Receptionist — Staff scheduling & sick-leave recovery (Feature 18).
 *
 * Server Component: builds the doctor roster with today's load and upcoming
 * commitments, then hands it to the interactive dashboard (availability toggle +
 * AI recovery plan).
 */
import { getDoctors, getAppointments } from "@/lib/queries"
import { doctorName } from "@/lib/display"
import { StaffClient, type RosterDoctor } from "./staff-client"

export const dynamic = "force-dynamic"

const ACTIVE = new Set(["scheduled", "waiting", "in_progress"])

export default async function ReceptionistStaffPage() {
  const [doctors, appointments] = await Promise.all([getDoctors(), getAppointments()])
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayStr = startOfToday.toDateString()

  const roster: RosterDoctor[] = doctors.map((d) => {
    const todayCount = appointments.filter(
      (a) => a.doctor_id === d.id && ACTIVE.has(a.status) && new Date(a.starts_at).toDateString() === todayStr,
    ).length
    const upcomingCount = appointments.filter(
      (a) => a.doctor_id === d.id && a.status === "scheduled" && Date.parse(a.starts_at) >= startOfToday.getTime(),
    ).length
    // Appointments inside the absence window that need recovery (off-duty only).
    const from = d.unavailable_from ?? null
    const until = d.unavailable_until ?? null
    const fromMs = from ? Date.parse(`${from}T00:00:00`) : startOfToday.getTime()
    const untilMs = until ? Date.parse(`${until}T23:59:59.999`) : Number.POSITIVE_INFINITY
    const affectedCount = d.is_available
      ? 0
      : appointments.filter(
          (a) => a.doctor_id === d.id && a.status === "scheduled" &&
            Date.parse(a.starts_at) >= fromMs && Date.parse(a.starts_at) <= untilMs,
        ).length
    return {
      id: d.id,
      name: doctorName(d),
      specialization: d.specialization,
      isAvailable: d.is_available,
      capacity: d.max_daily_capacity,
      todayCount,
      upcomingCount,
      unavailableFrom: from,
      unavailableUntil: until,
      affectedCount,
    }
  })

  return <StaffClient roster={roster} />
}
