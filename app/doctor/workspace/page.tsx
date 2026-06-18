/**
 * Doctor — Clinical Workspace (Features 2, 10).
 *
 * Server Component: builds the doctor's live consultation queue for today
 * (waiting and scheduled patients), enriching each entry with the patient's
 * clinical briefing (allergies, conditions, medications, latest vitals) and
 * recent reports, then hands it to the interactive workspace.
 */
import {
  getCurrentDoctor, getAppointmentsByDoctor, getPatientById,
  getPatientClinical, getReportsByPatient, getAppointmentsByPatient,
  getReportByAppointment, getAppointmentBillingItems, getVitalsByAppointment,
} from "@/lib/queries"
import { patientName } from "@/lib/display"
import { WorkspaceClient, type QueueEntry } from "./workspace-client"

export const dynamic = "force-dynamic"

export default async function DoctorWorkspace() {
  const doctor = await getCurrentDoctor()
  if (!doctor) {
    return <div className="p-8 text-muted-foreground">No doctor account found.</div>
  }

  const appointments = await getAppointmentsByDoctor(doctor.id)
  // The workspace shows only CHECKED-IN patients: those waiting and those
  // already called in ("with doctor"). A patient who is merely scheduled has not
  // arrived and cannot be consulted; calling a patient must not remove them.
  const todayStr = new Date().toDateString()
  const queueAppointments = appointments
    .filter((a) => new Date(a.starts_at).toDateString() === todayStr)
    .filter((a) => a.status === "waiting" || a.status === "in_progress")
    .sort((a, b) => {
      // Patients already called to the office (in_progress) come first.
      const rank = (s: string) => (s === "in_progress" ? 0 : 1)
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
      return +new Date(a.starts_at) - +new Date(b.starts_at)
    })

  // Assemble each queue entry with its clinical context (queue is small).
  const queue: QueueEntry[] = await Promise.all(
    queueAppointments.map(async (a) => {
      const [patient, clinical, reports, existingReport, existingItems, apptVitals, allAppointments] = await Promise.all([
        getPatientById(a.patient_id),
        getPatientClinical(a.patient_id),
        getReportsByPatient(a.patient_id),
        getReportByAppointment(a.id),
        getAppointmentBillingItems(a.id),
        getVitalsByAppointment(a.id),
        getAppointmentsByPatient(a.patient_id),
      ])
      // Past appointments (most recent first), each tagged with its report's
      // diagnosis where one exists — the doctor's "previous visits" timeline.
      const reportByAppt = new Map(reports.map((r) => [r.appointment_id, r]))
      const history = allAppointments
        .filter((h) => h.id !== a.id)
        .sort((x, y) => +new Date(y.starts_at) - +new Date(x.starts_at))
        .slice(0, 8)
        .map((h) => ({
          id: h.id,
          date: h.starts_at,
          reason: h.reason,
          status: h.status,
          diagnosis: reportByAppt.get(h.id)?.diagnosis ?? null,
        }))
      return {
        appointmentId: a.id,
        patientId: a.patient_id,
        patientName: patient ? patientName(patient) : a.patient_name,
        status: a.status,
        startsAt: a.starts_at,
        reason: a.reason,
        insuranceType: patient?.insurance_type ?? "gkv",
        birthDate: patient?.birth_date ?? null,
        email: patient?.email ?? null,
        phone: patient?.phone ?? null,
        street: patient?.street ?? null,
        city: patient?.city ?? null,
        postalCode: patient?.postal_code ?? null,
        country: patient?.country ?? null,
        allergies: clinical.allergies.map((x) => x.substance),
        conditions: clinical.conditions.map((x) => x.label ?? x.icd10_code),
        medications: clinical.medications.map((m) => ({ name: m.name, dosage: m.dosage })),
        vitals: clinical.currentVitals && {
          heart_rate: clinical.currentVitals.heart_rate,
          systolic: clinical.currentVitals.systolic,
          diastolic: clinical.currentVitals.diastolic,
          temperature_c: clinical.currentVitals.temperature_c,
          weight_kg: clinical.currentVitals.weight_kg,
        },
        recentReports: reports.slice(0, 3).map((r) => ({ id: r.id, diagnosis: r.diagnosis })),
        history,
        // This appointment's own recorded vitals (so the editable card reloads).
        existingVitals: apptVitals && {
          systolic: apptVitals.systolic,
          diastolic: apptVitals.diastolic,
          heart_rate: apptVitals.heart_rate,
          temperature_c: apptVitals.temperature_c,
          weight_kg: apptVitals.weight_kg,
          height_cm: apptVitals.height_cm,
        },
        // The appointment's own consultation, so an in-progress draft reloads.
        existingReport: existingReport && {
          id: existingReport.id,
          diagnosis: existingReport.diagnosis,
          rawNotes: existingReport.raw_notes,
          formattedReport: existingReport.formatted_report,
          prescriptions: existingReport.prescriptions ?? [],
          status: existingReport.status,
        },
        existingCodes: existingItems.map((it) => ({
          catalog: it.catalog,
          code: it.code,
          description: it.description,
          points: it.points,
          multiplier: it.multiplier,
        })),
      }
    }),
  )

  return <WorkspaceClient doctorId={doctor.id} queue={queue} />
}
