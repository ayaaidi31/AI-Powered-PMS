/**
 * Shared loader for the staff patient profile (doctor & receptionist). Assembles
 * the patient, clinical summary, reports, appointments and billing documents in
 * the exact shape the PatientDetailClient expects. Read-only.
 */
import {
  getPatientById, getPatientClinical, getReportsByPatient, getAppointmentsByPatient,
  getDoctorById, getInvoicesDetailed, getAppointmentBillingItems,
} from "./queries"
import { doctorName } from "./display"
import type { PatientDetailData } from "@/components/patient-detail-client"

export async function loadPatientDetail(id: string): Promise<PatientDetailData | null> {
  const patient = await getPatientById(id)
  if (!patient) return null

  const [clinical, reports, appointments] = await Promise.all([
    getPatientClinical(id),
    getReportsByPatient(id),
    getAppointmentsByPatient(id),
  ])

  // Resolve the treating doctor's name/specialty for each report and appointment.
  const doctorIds = [...new Set([...reports.map((r) => r.doctor_id), ...appointments.map((a) => a.doctor_id)])]
  const doctorRows = await Promise.all(doctorIds.map((d) => getDoctorById(d)))
  const docMap = new Map(doctorRows.filter(Boolean).map((d) => [d!.id, d!]))
  const docName = (docId: string) => { const d = docMap.get(docId); return d ? doctorName(d) : "Treating physician" }
  const docSpec = (docId: string) => docMap.get(docId)?.specialization ?? null

  const patientInvoices = (await getInvoicesDetailed()).filter((i) => i.patient_id === id && i.status !== "storno")
  const billing = await Promise.all(
    patientInvoices.map(async (inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      insuranceType: inv.insurance_type,
      totalCents: inv.total_cents,
      status: inv.status,
      dueDate: inv.due_date,
      invoiceDate: inv.created_at,
      serviceDate: inv.starts_at,
      items: await getAppointmentBillingItems(inv.appointment_id),
    })),
  )

  return {
    patient,
    clinical: {
      allergies: clinical.allergies.map((a) => a.substance),
      conditions: clinical.conditions.map((c) => c.label ?? c.icd10_code),
      medications: clinical.medications.map((m) => ({ name: m.name, dosage: m.dosage, frequency: m.frequency })),
      vitals: clinical.currentVitals,
    },
    reports: reports.map((r) => ({
      id: r.id,
      diagnosis: r.diagnosis,
      formatted_report: r.formatted_report,
      raw_notes: r.raw_notes,
      prescriptions: r.prescriptions ?? [],
      status: r.status,
      created_at: r.created_at,
      approved_at: r.approved_at,
      doctorName: docName(r.doctor_id),
      doctorSpecialization: docSpec(r.doctor_id),
    })),
    appointments: appointments.map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      status: a.status,
      reason: a.reason,
      durationMin: a.duration_min,
      checkInAt: a.check_in_at,
      doctorName: docName(a.doctor_id),
    })),
    billing,
  }
}
