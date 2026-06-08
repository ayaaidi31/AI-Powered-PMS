"use client"

/**
 * Doctor's billing overview (read-only). Summarises the value of the doctor's
 * completed consultations and lists them with their billing status. Statutory
 * (GKV) values are the KV settlement estimate; private values are the GOÄ
 * invoice amount. Reception performs the actual invoicing.
 */
import { Receipt, Landmark, Euro, ClipboardCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { BillingWorklistRow } from "@/lib/queries"
import type { InvoiceRow } from "@/lib/seed-data"
import { insuranceLabel, insuranceVariant, formatCents } from "@/lib/display"

export interface DoctorBillingRow extends BillingWorklistRow {
  value_cents: number
}

const INVOICE_STATUS: Record<InvoiceRow["status"], string> = {
  ready_for_kv: "Queued for KV",
  pending_payment: "Pending Payment",
  sent: "Sent",
  paid: "Paid",
  storno: "Storno",
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE")

export function DoctorBillingClient({ rows }: { rows: DoctorBillingRow[] }) {
  const gkvValue = rows.filter((r) => r.insurance_type === "gkv").reduce((s, r) => s + r.value_cents, 0)
  const privateValue = rows.filter((r) => r.insurance_type !== "gkv").reduce((s, r) => s + r.value_cents, 0)

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Receipt className="w-6 h-6 text-primary" /> Billing
        </h1>
        <p className="text-muted-foreground">Value of your completed consultations</p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard icon={<ClipboardCheck className="w-5 h-5 text-primary" />} label="Completed consultations" value={String(rows.length)} />
        <SummaryCard icon={<Landmark className="w-5 h-5 text-primary" />} label="GKV value (KV estimate)" value={formatCents(gkvValue)} />
        <SummaryCard icon={<Euro className="w-5 h-5 text-primary" />} label="Private (GOÄ invoiced)" value={formatCents(privateValue)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Consultations</CardTitle>
          <CardDescription>{rows.length} completed</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No completed consultations yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Codes</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Billing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.appointment_id}>
                    <TableCell>{fmtDate(r.starts_at)}</TableCell>
                    <TableCell className="font-medium">{r.patient_name}</TableCell>
                    <TableCell><Badge variant={insuranceVariant(r.insurance_type)}>{insuranceLabel(r.insurance_type)}</Badge></TableCell>
                    <TableCell className="text-right">{r.code_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.code_count > 0 ? formatCents(r.value_cents) : "—"}</TableCell>
                    <TableCell>
                      {r.code_count === 0 ? (
                        <span className="text-xs text-destructive">No codes</span>
                      ) : r.invoice_status ? (
                        <Badge variant="outline">{INVOICE_STATUS[r.invoice_status]}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Awaiting reception</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        GKV values are the estimated KV settlement (EBM points × Orientierungswert); statutory patients are not
        invoiced directly. Private/self-pay values are the GOÄ invoice amount. Reception issues the invoices.
      </p>
    </div>
  )
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">{icon}</div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold text-foreground">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
