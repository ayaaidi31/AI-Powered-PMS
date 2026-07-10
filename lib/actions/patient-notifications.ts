"use server"

/**
 * Live, derived notifications for the signed-in patient (read-only). Fetches the
 * patient's current data and hands it to the pure `buildPatientNotifications`
 * builder. No stored notifications table — items are time-windowed instead.
 */
import {
  getCurrentPatient, getAppointmentsByPatient, getReportsByPatient, getInvoicesByPatient,
} from "@/lib/queries"
import { getPendingProfileProposals } from "@/lib/actions/profile-proposals"
import { buildPatientNotifications } from "@/lib/patient-notifications"
import type { NotificationItem } from "@/components/notification-bell"

export async function getPatientNotifications(): Promise<NotificationItem[]> {
  const patient = await getCurrentPatient()
  if (!patient) return []

  const [appointments, reports, invoices, proposals] = await Promise.all([
    getAppointmentsByPatient(patient.id),
    getReportsByPatient(patient.id),
    getInvoicesByPatient(patient.id),
    getPendingProfileProposals(patient.id),
  ])

  return buildPatientNotifications({
    nowMs: Date.now(),
    appointments: appointments.map((a) => ({
      id: a.id, starts_at: a.starts_at, status: a.status, staff_modified_at: a.staff_modified_at ?? null,
    })),
    reports: reports.map((r) => ({
      id: r.id, status: r.status, created_at: r.created_at, approved_at: r.approved_at ?? null,
    })),
    invoices: invoices.map((i) => ({ id: i.id, status: i.status, insurance_type: i.insurance_type })),
    pendingProposals: proposals.length,
  })
}
