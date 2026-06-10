/**
 * Patient — Report Detail (Feature 14).
 *
 * Server Component: loads the requested report and the treating doctor's name,
 * then renders the official report. The on-demand AI simplification (Feature 14)
 * is not yet connected; its control is presented as a placeholder.
 */
import { getReportById, getDoctorById, getPatientById } from "@/lib/queries"
import { doctorName, patientName } from "@/lib/display"
import { RecordDetailClient } from "./record-detail-client"

export const dynamic = "force-dynamic"

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const report = await getReportById(id)
  if (!report) {
    return <RecordDetailClient report={null} />
  }
  const [doctor, patient] = await Promise.all([
    getDoctorById(report.doctor_id),
    getPatientById(report.patient_id),
  ])
  return (
    <RecordDetailClient
      report={{
        id: report.id,
        diagnosis: report.diagnosis,
        formatted_report: report.formatted_report,
        raw_notes: report.raw_notes,
        prescriptions: report.prescriptions ?? [],
        status: report.status,
        date: report.approved_at ?? report.created_at,
        doctorName: doctor ? doctorName(doctor) : "Treating physician",
        doctorSpecialization: doctor?.specialization ?? null,
        patientName: patient ? patientName(patient) : "Patient",
        patientDob: patient?.birth_date ?? null,
      }}
    />
  )
}
