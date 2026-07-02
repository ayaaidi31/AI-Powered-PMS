/**
 * Doctor — Billing overview (read-only).
 *
 * Server Component: gathers the doctor's completed consultations and computes a
 * value for each — GOÄ invoice amount for private patients, and the EBM KV
 * settlement value (points × Orientierungswert) for statutory patients. Actual
 * invoicing is performed by reception (Feature 7); this is the doctor's summary.
 */
import {
  getCurrentDoctor, getDoctorBillingWorklist, getAppointmentBillingItems,
} from "@/lib/queries"
import { DoctorBillingClient, type DoctorBillingRow } from "./billing-client"

export const dynamic = "force-dynamic"

// EBM 2024 bundeseinheitlicher Orientierungswert (KV value per point).
const EBM_ORIENTIERUNGSWERT_CENTS = 11.9339

export default async function DoctorBillingPage() {
  const doctor = await getCurrentDoctor()
  if (!doctor) {
    return <div className="p-8 text-muted-foreground">No doctor account found.</div>
  }

  const worklist = await getDoctorBillingWorklist(doctor.id)
  const rows: DoctorBillingRow[] = await Promise.all(
    worklist.map(async (w) => {
      const items = await getAppointmentBillingItems(w.appointment_id)
      const value_cents =
        w.insurance_type === "gkv"
          ? Math.round(items.reduce((s, i) => s + (i.points ?? 0) * EBM_ORIENTIERUNGSWERT_CENTS, 0))
          : items.reduce((s, i) => s + (i.amount_cents ?? 0), 0)
      return { ...w, value_cents, items }
    }),
  )

  return <DoctorBillingClient rows={rows} />
}
