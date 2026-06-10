/**
 * Doctor — Patient detail.
 *
 * Server Component: loads a single patient's profile, clinical summary, reports
 * and appointment history for the treating doctor to review.
 */
import { notFound } from "next/navigation"
import {
  getCurrentDoctor, getPatientById, getPatientClinical,
  getReportsByPatient, getAppointmentsByPatient,
} from "@/lib/queries"
import { PatientDetailClient } from "./patient-detail-client"

export const dynamic = "force-dynamic"

export default async function DoctorPatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const doctor = await getCurrentDoctor()
  if (!doctor) {
    return <div className="p-8 text-muted-foreground">No doctor account found.</div>
  }
  const patient = await getPatientById(id)
  if (!patient) notFound()

  const [clinical, reports, appointments] = await Promise.all([
    getPatientClinical(id),
    getReportsByPatient(id),
    getAppointmentsByPatient(id),
  ])

  return (
    <PatientDetailClient
      patient={patient}
      clinical={{
        allergies: clinical.allergies.map((a) => a.substance),
        conditions: clinical.conditions.map((c) => c.label ?? c.icd10_code),
        medications: clinical.medications.map((m) => ({ name: m.name, dosage: m.dosage, frequency: m.frequency })),
        vitals: clinical.currentVitals,
      }}
      reports={reports.map((r) => ({
        id: r.id,
        diagnosis: r.diagnosis,
        formatted_report: r.formatted_report,
        raw_notes: r.raw_notes,
        prescriptions: r.prescriptions ?? [],
        status: r.status,
        created_at: r.created_at,
      }))}
      appointments={appointments.map((a) => ({
        id: a.id,
        starts_at: a.starts_at,
        status: a.status,
        reason: a.reason,
      }))}
    />
  )
}
