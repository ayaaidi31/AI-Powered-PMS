/**
 * Patient — single invoice, printable / downloadable. Sandboxed to the signed-in
 * patient's own invoices; statutory (GKV) records render as a Leistungsnachweis.
 */
import { getCurrentPatient, getInvoiceById, getAppointmentBillingItems } from "@/lib/queries"
import { patientName } from "@/lib/display"
import { getT } from "@/lib/i18n/server"
import { InvoicePrintClient } from "./invoice-print-client"

export const dynamic = "force-dynamic"

export default async function PatientInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT()
  const { id } = await params
  const patient = await getCurrentPatient()
  if (!patient) {
    return <div className="p-8 text-muted-foreground">{t("patientRecords.noPatientAccount")}</div>
  }
  const invoice = await getInvoiceById(id)
  if (!invoice || invoice.patient_id !== patient.id || invoice.status === "storno") {
    return <div className="p-8 text-muted-foreground">{t("patientRecords.invoiceNotFound")}</div>
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
