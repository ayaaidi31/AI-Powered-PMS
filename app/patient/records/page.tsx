/**
 * Patient — Health Records (Feature 15 entry point).
 *
 * Server Component: resolves the current patient and loads their finalised
 * medical reports, then renders the searchable list.
 */
import { getCurrentPatient, getReportsByPatient, getCurrentDoctor } from "@/lib/queries"
import { doctorName } from "@/lib/display"
import { getT } from "@/lib/i18n/server"
import { RecordsClient, type ReportListItem } from "./records-client"

export const dynamic = "force-dynamic"

export default async function PatientRecordsPage() {
  const { t } = await getT()
  const patient = await getCurrentPatient()
  if (!patient) {
    return <div className="p-8 text-muted-foreground">{t("patientRecords.noPatientAccount")}</div>
  }

  const [reports, doctor] = await Promise.all([
    getReportsByPatient(patient.id),
    getCurrentDoctor(),
  ])
  const treatingDoctor = doctor ? doctorName(doctor) : t("patientRecords.treatingPhysician")

  const items: ReportListItem[] = reports.map((r) => ({
    id: r.id,
    diagnosis: r.diagnosis,
    doctorName: treatingDoctor,
    date: r.created_at,
    status: r.status,
  }))

  return <RecordsClient reports={items} />
}
