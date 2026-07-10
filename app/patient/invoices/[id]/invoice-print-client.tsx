"use client"

import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InvoiceDocument } from "@/components/invoice-document"

interface InvoiceLine {
  catalog: "EBM" | "GOAE"
  code: string
  description: string
  points: number | null
  multiplier: number | null
  amount_cents: number | null
}

export function InvoicePrintClient(props: {
  patientName: string
  patientDob: string | null
  insuranceType: "gkv" | "pkv" | "selbstzahler"
  invoiceNumber: string | null
  invoiceDate: string
  serviceDate: string
  dueDate: string | null
  totalCents: number | null
  items: InvoiceLine[]
}) {
  return (
    <div className="min-h-screen bg-muted/40">
      {/* Toolbar — hidden when printing. */}
      <div className="print:hidden sticky top-0 z-10 border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/patient/invoices">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to billing
            </Button>
          </Link>
          <Button size="sm" className="gap-2" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 print:p-0">
        <InvoiceDocument
          insuranceType={props.insuranceType}
          patientName={props.patientName}
          patientDob={props.patientDob}
          invoiceNumber={props.invoiceNumber}
          invoiceDate={props.invoiceDate}
          serviceDate={props.serviceDate}
          dueDate={props.dueDate}
          items={props.items}
          totalCents={props.totalCents}
        />
      </div>
    </div>
  )
}
