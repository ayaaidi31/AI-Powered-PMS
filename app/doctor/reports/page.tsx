/**
 * Doctor — Reports.
 *
 * Server Component: loads every report authored by the signed-in doctor and
 * hands them to the interactive list (search, filter, read-only detail view).
 */
import { getCurrentDoctor, getReportsByDoctor } from "@/lib/queries"
import { doctorName } from "@/lib/display"
import { DoctorReportsClient } from "./reports-client"

export const dynamic = "force-dynamic"

export default async function DoctorReportsPage() {
  const doctor = await getCurrentDoctor()
  if (!doctor) {
    return <div className="p-8 text-muted-foreground">No doctor account found.</div>
  }
  const reports = await getReportsByDoctor(doctor.id)
  return (
    <DoctorReportsClient
      reports={reports}
      doctor={{ name: doctorName(doctor), specialization: doctor.specialization }}
    />
  )
}
