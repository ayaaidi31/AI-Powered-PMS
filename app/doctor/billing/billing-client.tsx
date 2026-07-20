"use client"

/**
 * Doctor's billing overview (read-only). Summarises the value of the doctor's
 * completed consultations and lists them with their billing status. Statutory
 * (GKV) values are the KV settlement estimate; private values are the GOÄ
 * invoice amount. Reception performs the actual invoicing.
 */
import { useState, useRef } from "react"
import { Receipt, Landmark, Euro, ClipboardCheck, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { BillingWorklistRow, BillingItem } from "@/lib/queries"
import type { InvoiceRow } from "@/lib/seed-data"
import { insuranceLabel, insuranceVariant, formatCents } from "@/lib/display"
import { InvoiceDocument } from "@/components/invoice-document"
import { printReport } from "@/lib/print-element"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"

export interface DoctorBillingRow extends BillingWorklistRow {
  value_cents: number
  items: BillingItem[]
}

export function DoctorBillingClient({ rows }: { rows: DoctorBillingRow[] }) {
  const t = useT()
  const locale = useLocale()
  const [viewing, setViewing] = useState<DoctorBillingRow | null>(null)
  const invoiceRef = useRef<HTMLDivElement>(null)

  const invoiceStatusLabel: Record<InvoiceRow["status"], string> = {
    ready_for_kv: t("billing.statusReadyForKv"),
    pending_payment: t("billing.statusPendingPayment"),
    sent: t("billing.statusSent"),
    paid: t("billing.statusPaid"),
    storno: t("billing.statusVoided"),
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(INTL_LOCALE[locale])
  const gkvValue = rows.filter((r) => r.insurance_type === "gkv").reduce((s, r) => s + r.value_cents, 0)
  const privateValue = rows.filter((r) => r.insurance_type !== "gkv").reduce((s, r) => s + r.value_cents, 0)

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Receipt className="w-6 h-6 text-primary" /> {t("billing.title")}
        </h1>
        <p className="text-muted-foreground">{t("billing.subtitle")}</p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard icon={<ClipboardCheck className="w-5 h-5 text-primary" />} label={t("billing.completedConsultations")} value={String(rows.length)} />
        <SummaryCard icon={<Landmark className="w-5 h-5 text-primary" />} label={t("billing.gkvValueLabel")} value={formatCents(gkvValue)} />
        <SummaryCard icon={<Euro className="w-5 h-5 text-primary" />} label={t("billing.privateValueLabel")} value={formatCents(privateValue)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("billing.consultations")}</CardTitle>
          <CardDescription>{t("billing.consultationsDescription", { count: rows.length })}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>{t("billing.emptyState")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("billing.columnDate")}</TableHead>
                  <TableHead>{t("billing.columnPatient")}</TableHead>
                  <TableHead>{t("billing.columnType")}</TableHead>
                  <TableHead className="text-right">{t("billing.columnCodes")}</TableHead>
                  <TableHead className="text-right">{t("billing.columnValue")}</TableHead>
                  <TableHead>{t("billing.columnBilling")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.appointment_id}
                    onClick={() => r.code_count > 0 && setViewing(r)}
                    className={r.code_count > 0 ? "cursor-pointer hover:bg-accent/50" : ""}
                  >
                    <TableCell>{fmtDate(r.starts_at)}</TableCell>
                    <TableCell className="font-medium">{r.patient_name}</TableCell>
                    <TableCell><Badge variant={insuranceVariant(r.insurance_type)}>{insuranceLabel(r.insurance_type)}</Badge></TableCell>
                    <TableCell className="text-right">{r.code_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.code_count > 0 ? formatCents(r.value_cents) : "—"}</TableCell>
                    <TableCell>
                      {r.code_count === 0 ? (
                        <span className="text-xs text-destructive">{t("billing.noCodes")}</span>
                      ) : r.invoice_status ? (
                        <Badge variant="outline">{invoiceStatusLabel[r.invoice_status]}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("billing.awaitingReception")}</span>
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
        {t("billing.footnote")}
      </p>

      {/* Billing document preview (read-only) */}
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          {viewing && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <DialogTitle>
                    {viewing.insurance_type === "gkv" ? t("billing.documentTitleGkv") : t("billing.documentTitlePrivate")}
                  </DialogTitle>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => printReport(invoiceRef.current)}>
                    <Printer className="w-4 h-4" /> {t("billing.printPdf")}
                  </Button>
                </div>
                <DialogDescription>{viewing.patient_name} · {fmtDate(viewing.starts_at)}</DialogDescription>
              </DialogHeader>
              <InvoiceDocument
                ref={invoiceRef}
                insuranceType={viewing.insurance_type}
                patientName={viewing.patient_name}
                invoiceNumber={null}
                invoiceDate={viewing.starts_at}
                serviceDate={viewing.starts_at}
                items={viewing.items}
                totalCents={viewing.insurance_type === "gkv" ? null : viewing.value_cents}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
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
