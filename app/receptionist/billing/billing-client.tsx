"use client"

/**
 * Billing dashboard (Feature 7 — UC-REC-01).
 *
 * Two areas:
 *  1. Worklist of completed appointments. The processing path is chosen by the
 *     patient's insurance type (REQ-REC-02):
 *       - GKV (statutory): EBM codes are validated, NO € is shown to the
 *         patient, and the record is queued for the quarterly KV submission
 *         (Quartalsabrechnung) — REQ-REC-04.
 *       - PKV / Selbstzahler (private / self-pay): a §12 GOÄ invoice is
 *         generated with the computed total — REQ-REC-03.
 *     Appointments without codes are blocked (REQ-REC-05).
 *  2. Invoice history with status actions (send / mark paid / storno). A storno
 *     requires confirmation because invoices, once issued, are never deleted
 *     (BR-03-03 / §14 UStG).
 */
import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Receipt, AlertCircle, CheckCircle2, Send, Ban, Landmark, Euro, Printer,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import type { InvoiceRow } from "@/lib/seed-data"
import type { BillingWorklistRow, BillingItem, InvoiceListRow } from "@/lib/queries"
import { insuranceLabel, insuranceVariant, formatCents } from "@/lib/display"
import {
  generateInvoice, markInvoiceSent, markInvoicePaid, stornoInvoice,
} from "@/lib/actions/invoices"
import { InvoiceDocument } from "@/components/invoice-document"
import { printReport } from "@/lib/print-element"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"
import type { TKey } from "@/lib/i18n/translate"

export interface BillingRow extends BillingWorklistRow {
  items: BillingItem[]
  total_cents: number | null
}

const INVOICE_STATUS: Record<InvoiceRow["status"], { key: TKey; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  ready_for_kv: { key: "receptionMgmt.statusReadyForKv" as TKey, variant: "secondary" },
  pending_payment: { key: "receptionMgmt.statusPendingPayment" as TKey, variant: "default" },
  sent: { key: "receptionMgmt.statusSent" as TKey, variant: "outline" },
  paid: { key: "receptionMgmt.statusPaid" as TKey, variant: "default" },
  storno: { key: "receptionMgmt.statusVoided" as TKey, variant: "destructive" },
}

export function BillingClient({ rows, invoices }: { rows: BillingRow[]; invoices: InvoiceListRow[] }) {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(INTL_LOCALE[locale])
  const [isPending, startTransition] = useTransition()
  const [processing, setProcessing] = useState<BillingRow | null>(null)
  const [stornoTarget, setStornoTarget] = useState<InvoiceListRow | null>(null)
  const [viewing, setViewing] = useState<InvoiceListRow | null>(null)
  const invoiceRef = useRef<HTMLDivElement>(null)

  const pending = rows.filter((r) => !r.invoice_id)
  const done = rows.filter((r) => r.invoice_id)

  function run(action: Promise<{ status: string; message?: string }>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action
      if (result.status === "ok") {
        toast.success(success)
        after?.()
        router.refresh()
      } else {
        toast.error(result.message ?? t("receptionMgmt.actionFailed"))
      }
    })
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Receipt className="w-6 h-6 text-primary" /> {t("receptionMgmt.billingTitle")}
        </h1>
        <p className="text-muted-foreground">
          {t("receptionMgmt.billingSubtitle")}
        </p>
      </div>

      {/* Worklist */}
      <Card>
        <CardHeader>
          <CardTitle>{t("receptionMgmt.awaitingBilling")}</CardTitle>
          <CardDescription>{pending.length === 1 ? t("receptionMgmt.pendingCountOne", { count: pending.length }) : t("receptionMgmt.pendingCountMany", { count: pending.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("receptionMgmt.nothingAwaiting")}</p>
          ) : (
            <div className="space-y-3">
              {pending.map((r) => (
                <div key={r.appointment_id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{r.patient_name}</span>
                      <Badge variant={insuranceVariant(r.insurance_type)}>{insuranceLabel(r.insurance_type)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {fmtDate(r.starts_at)} · {r.code_count === 1 ? t("receptionMgmt.codeCountOne", { count: r.code_count }) : t("receptionMgmt.codeCountMany", { count: r.code_count })}
                      {r.total_cents != null && <> · {formatCents(r.total_cents)}</>}
                    </p>
                  </div>
                  {r.code_count === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-destructive shrink-0">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {t("receptionMgmt.noCodesRequest")}
                    </div>
                  ) : (
                    <Button onClick={() => setProcessing(r)} disabled={isPending} className="gap-2 shrink-0">
                      {r.insurance_type === "gkv" ? <Landmark className="w-4 h-4" /> : <Euro className="w-4 h-4" />}
                      {t("receptionMgmt.process")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice history */}
      <Card>
        <CardHeader>
          <CardTitle>{t("receptionMgmt.invoicesTitle")}</CardTitle>
          <CardDescription>{invoices.length === 1 ? t("receptionMgmt.recordCountOne", { count: invoices.length }) : t("receptionMgmt.recordCountMany", { count: invoices.length })}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("receptionMgmt.noInvoices")}</p>
          ) : (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("receptionMgmt.colNumber")}</TableHead>
                  <TableHead>{t("receptionMgmt.colPatient")}</TableHead>
                  <TableHead>{t("receptionMgmt.colType")}</TableHead>
                  <TableHead className="text-right">{t("receptionMgmt.colTotal")}</TableHead>
                  <TableHead>{t("receptionMgmt.colStatus")}</TableHead>
                  <TableHead className="text-right">{t("receptionMgmt.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.patient_name}</TableCell>
                    <TableCell>{insuranceLabel(inv.insurance_type)}</TableCell>
                    <TableCell className="text-right">{inv.total_cents == null ? "—" : formatCents(inv.total_cents)}</TableCell>
                    <TableCell><Badge variant={INVOICE_STATUS[inv.status].variant}>{t(INVOICE_STATUS[inv.status].key)}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {inv.status !== "storno" && (
                          <Button size="sm" variant="ghost" onClick={() => setViewing(inv)}>{t("receptionMgmt.view")}</Button>
                        )}
                        {inv.status === "pending_payment" && (
                          <Button size="sm" variant="outline" className="gap-1" disabled={isPending}
                            onClick={() => run(markInvoiceSent(inv.id), t("receptionMgmt.invoiceSentToast"))}>
                            <Send className="w-3.5 h-3.5" /> {t("receptionMgmt.send")}
                          </Button>
                        )}
                        {(inv.status === "sent" || inv.status === "pending_payment") && (
                          <Button size="sm" variant="outline" className="gap-1" disabled={isPending}
                            onClick={() => run(markInvoicePaid(inv.id), t("receptionMgmt.invoicePaidToast"))}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> {t("receptionMgmt.markPaidBtn")}
                          </Button>
                        )}
                        {inv.status !== "storno" && (
                          <Button size="sm" variant="ghost" className="text-destructive gap-1" disabled={isPending}
                            onClick={() => setStornoTarget(inv)}>
                            <Ban className="w-3.5 h-3.5" /> {t("receptionMgmt.voidBtn")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Process dialog — preview the billing document before confirming. */}
      <Dialog open={processing !== null} onOpenChange={(o) => !o && setProcessing(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          {processing && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {processing.insurance_type === "gkv" ? t("receptionMgmt.approveKvPreview") : t("receptionMgmt.invoicePreviewGoae")}
                </DialogTitle>
                <DialogDescription>
                  {processing.patient_name} · {fmtDate(processing.starts_at)} · {t("receptionMgmt.draftPreview")}
                </DialogDescription>
              </DialogHeader>
              <InvoiceDocument
                insuranceType={processing.insurance_type}
                patientName={processing.patient_name}
                invoiceNumber={null}
                invoiceDate={processing.starts_at}
                serviceDate={processing.starts_at}
                items={processing.items}
                totalCents={processing.total_cents}
              />
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessing(null)} disabled={isPending}>{t("common.cancel")}</Button>
            <Button
              disabled={isPending}
              onClick={() => processing && run(
                generateInvoice(processing.appointment_id),
                processing.insurance_type === "gkv"
                  ? t("receptionMgmt.approvedKvToast")
                  : t("receptionMgmt.invoiceGeneratedToast"),
                () => setProcessing(null),
              )}
            >
              {processing?.insurance_type === "gkv" ? t("receptionMgmt.approveKv") : t("receptionMgmt.generateInvoice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View an issued billing document — preview and print after confirmation. */}
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          {viewing && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <DialogTitle>
                    {viewing.insurance_type === "gkv" ? t("receptionMgmt.documentTitleGkv") : t("receptionMgmt.documentTitlePrivate", { number: viewing.invoice_number ?? "" })}
                  </DialogTitle>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => printReport(invoiceRef.current)}>
                    <Printer className="w-4 h-4" /> {t("receptionMgmt.printPdf")}
                  </Button>
                </div>
                <DialogDescription>{viewing.patient_name} · {fmtDate(viewing.starts_at)}</DialogDescription>
              </DialogHeader>
              <InvoiceDocument
                ref={invoiceRef}
                insuranceType={viewing.insurance_type}
                patientName={viewing.patient_name}
                insurerName={viewing.insurer_name}
                insuranceNumber={viewing.versicherten_id}
                invoiceNumber={viewing.invoice_number}
                invoiceDate={viewing.created_at}
                serviceDate={viewing.starts_at}
                dueDate={viewing.due_date}
                items={rows.find((r) => r.appointment_id === viewing.appointment_id)?.items ?? []}
                totalCents={viewing.total_cents}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Storno confirmation */}
      <AlertDialog open={stornoTarget !== null} onOpenChange={(o) => !o && setStornoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("receptionMgmt.voidDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {stornoTarget && `${t("receptionMgmt.voidDescLead", { number: stornoTarget.invoice_number ?? "", patient: stornoTarget.patient_name })} `}
              {t("receptionMgmt.voidDescTail")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("receptionMgmt.keepInvoice")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isPending}
              onClick={() => stornoTarget && run(stornoInvoice(stornoTarget.id), t("receptionMgmt.reversalIssuedToast"), () => setStornoTarget(null))}
            >
              {t("receptionMgmt.voidInvoiceBtn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
