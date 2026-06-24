/**
 * Doctor — Consultation Record (single visit, consolidated).
 *
 * Server Component: gathers everything documented during one consultation —
 * the report, the recorded vitals, prescriptions, billing codes and invoice —
 * into one canonical, printable clinical record. A doctor may only open their
 * own reports (RBAC + ownership check). Approved records are immutable
 * (BR-02-06); unsigned ones can be signed/finalised here.
 */
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import {
  getCurrentDoctor, getReportById, getPatientById, getAppointmentById,
  getVitalsByAppointment, getBillingCodesForReport, getInvoiceByAppointment,
} from "@/lib/queries"
import { doctorName, patientName, insuranceLabel } from "@/lib/display"
import { ConsultationRecordClient } from "./consultation-record-client"

export const dynamic = "force-dynamic"

export default async function ConsultationRecordPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const doctor = await getCurrentDoctor()
  if (!doctor) return <div className="p-8 text-muted-foreground">No doctor account found.</div>

  const report = await getReportById(id)
  // Not found, soft-deleted, or authored by another doctor → 404 (no data leak).
  if (!report || report.deleted_at || report.doctor_id !== doctor.id) notFound()

  const [patient, appointment, vitals, codes, invoice] = await Promise.all([
    getPatientById(report.patient_id),
    getAppointmentById(report.appointment_id),
    getVitalsByAppointment(report.appointment_id),
    getBillingCodesForReport(report.id),
    getInvoiceByAppointment(report.appointment_id),
  ])

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-4">
      <Link
        href="/doctor/reports"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> Back to reports
      </Link>

      <ConsultationRecordClient
        report={report}
        patient={patient ? {
          name: patientName(patient),
          dob: patient.birth_date,
          insurance: insuranceLabel(patient.insurance_type),
        } : null}
        doctor={{ name: doctorName(doctor), specialization: doctor.specialization, lanr: doctor.lanr }}
        appointment={appointment ? {
          starts_at: appointment.starts_at,
          reason: appointment.reason,
          status: appointment.status,
        } : null}
        vitals={vitals}
        codes={codes}
        invoice={invoice}
      />
    </div>
  )
}
