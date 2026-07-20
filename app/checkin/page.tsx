/**
 * Clinic self check-in landing page (Feature 3, UC-PAT-01).
 *
 * This is where the single static clinic QR code points. It is public (no
 * role-guard) so a patient can reach it whether or not they are signed in on the
 * device they scanned with:
 *   - Signed in with a scheduled visit today → their appointment is shown and
 *     they confirm arrival with one tap (no code needed).
 *   - Otherwise → they enter the short check-in code issued at booking.
 *
 * The status transition is performed server-side by `checkInAppointment`
 * (session path) or `checkInByCode` (code path), both same-day enforced.
 */
import { headers } from "next/headers"
import { getCurrentPatient, getAppointmentsByPatient, getDoctors } from "@/lib/queries"
import { doctorName } from "@/lib/display"
import { getT } from "@/lib/i18n/server"
import { ClinicCheckInClient, type TodayAppointment } from "./checkin-client"

export const dynamic = "force-dynamic"

export default async function ClinicCheckInPage() {
  const { t } = await getT()
  const ua = (await headers()).get("user-agent") ?? ""
  const isMobile = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua)

  const patient = await getCurrentPatient()

  let todays: TodayAppointment[] = []
  let firstName: string | null = null
  if (patient) {
    firstName = patient.first_name
    const [appts, doctors] = await Promise.all([getAppointmentsByPatient(patient.id), getDoctors()])
    const docNames = new Map(doctors.map((d) => [d.id, doctorName(d)]))
    const todayStr = new Date().toDateString()
    todays = appts
      .filter(
        (a) =>
          new Date(a.starts_at).toDateString() === todayStr &&
          (a.status === "scheduled" || a.status === "waiting"),
      )
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
      .map((a) => ({
        id: a.id,
        starts_at: a.starts_at,
        status: a.status,
        reason: a.reason ?? null,
        doctor_name: docNames.get(a.doctor_id) ?? t("auth.yourDoctor"),
      }))
  }

  return <ClinicCheckInClient loggedIn={!!patient} firstName={firstName} appointments={todays} isMobile={isMobile} />
}
