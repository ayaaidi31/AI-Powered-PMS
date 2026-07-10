/**
 * Patient — single invoice, printable / downloadable. Sandboxed to the signed-in
 * patient's own invoices; statutory (GKV) records render as a Leistungsnachweis.
 */
import { getCurrentPatient, getInvoiceById, getAppointmentBillingItems } from "@/lib/queries"
import { patientName } from "@/lib/display"
import { InvoicePrintClient } from "./invoice-print-client"

export const dynamic = "force-dynamic"

export default async function PatientInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const patient = await getCurrentPatient()
  if (!patient) {
    return <div className="p-8 text-muted-foreground">No patient account found.</div>
  }
  const invoice = await getInvoiceById(id)
  if (!invoice || invoice.patient_id !== patient.id || invoice.status === "storno") {
    return <div className="p-8 text-muted-foreground">Invoice not found.</div>
  }
  const items = await getAppointmentBillingItems(invoice.appointment_id)

  return (
    <InvoicePrintClient
      patientName={patientName(patient)}
      patientDob={patient.birth_date}
      insuranceType={invoice.insurance_type}
      invoiceNumber={invoice.invoice_number}
      invoiceDate={invoice.created_at}
      serviceDate={invoice.starts_at}
      dueDate={invoice.due_date}
      totalCents={invoice.total_cents}
      items={items}
    />
  )
}
