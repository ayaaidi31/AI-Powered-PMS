/**
 * Patient — Billing / Invoices (Feature 7 surface for the patient).
 *
 * Lists the patient's invoices. Private/self-pay invoices are payable and
 * downloadable; statutory (GKV) visits show a "billed to insurance" note (the
 * patient is not invoiced).
 */
import { getCurrentPatient, getInvoicesByPatient } from "@/lib/queries"
import { PatientInvoicesClient } from "./invoices-client"

export const dynamic = "force-dynamic"

export default async function PatientInvoicesPage() {
  const patient = await getCurrentPatient()
  if (!patient) {
    return <div className="p-8 text-muted-foreground">No patient account found.</div>
  }
  const invoices = await getInvoicesByPatient(patient.id)
  return (
    <PatientInvoicesClient
      invoices={invoices.map((i) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        status: i.status,
        insurance_type: i.insurance_type,
        total_cents: i.total_cents,
        due_date: i.due_date,
        created_at: i.created_at,
      }))}
    />
  )
}
