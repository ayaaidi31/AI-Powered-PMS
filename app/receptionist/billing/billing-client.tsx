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

export interface BillingRow extends BillingWorklistRow {
  items: BillingItem[]
  total_cents: number | null
}

const INVOICE_STATUS: Record<InvoiceRow["status"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  ready_for_kv: { label: "Ready for KV", variant: "secondary" },
  pending_payment: { label: "Pending Payment", variant: "default" },
  sent: { label: "Sent", variant: "outline" },
  paid: { label: "Paid", variant: "default" },
  storno: { label: "Voided", variant: "destructive" },
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE")

export function BillingClient({ rows, invoices }: { rows: BillingRow[]; invoices: InvoiceListRow[] }) {
  const router = useRouter()
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
        toast.error(result.message ?? "Action failed.")
      }
    })
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Receipt className="w-6 h-6 text-primary" /> Billing
        </h1>
        <p className="text-muted-foreground">
          Finalise billing for completed consultations and manage invoices.
        </p>
      </div>

      {/* Worklist */}
      <Card>
        <CardHeader>
          <CardTitle>Awaiting Billing</CardTitle>
          <CardDescription>{pending.length} completed appointment{pending.length !== 1 ? "s" : ""} to process</CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nothing awaiting billing.</p>
          ) : (
            <div className="space-y-3">
              {pending.map((r) => (
                <div key={r.appointment_id} className="flex items-center gap-4 p-4 rounded-lg border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{r.patient_name}</span>
                      <Badge variant={insuranceVariant(r.insurance_type)}>{insuranceLabel(r.insurance_type)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {fmtDate(r.starts_at)} · {r.code_count} code{r.code_count !== 1 ? "s" : ""}
                      {r.total_cents != null && <> · {formatCents(r.total_cents)}</>}
                    </p>
                  </div>
                  {r.code_count === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      No codes — request from doctor
                    </div>
                  ) : (
                    <Button onClick={() => setProcessing(r)} disabled={isPending} className="gap-2">
                      {r.insurance_type === "gkv" ? <Landmark className="w-4 h-4" /> : <Euro className="w-4 h-4" />}
                      Process
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
          <CardTitle>Invoices</CardTitle>
          <CardDescription>{invoices.length} record{invoices.length !== 1 ? "s" : ""}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.patient_name}</TableCell>
                    <TableCell>{insuranceLabel(inv.insurance_type)}</TableCell>
                    <TableCell className="text-right">{inv.total_cents == null ? "—" : formatCents(inv.total_cents)}</TableCell>
                    <TableCell><Badge variant={INVOICE_STATUS[inv.status].variant}>{INVOICE_STATUS[inv.status].label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {inv.status !== "storno" && (
                          <Button size="sm" variant="ghost" onClick={() => setViewing(inv)}>View</Button>
                        )}
                        {inv.status === "pending_payment" && (
                          <Button size="sm" variant="outline" className="gap-1" disabled={isPending}
                            onClick={() => run(markInvoiceSent(inv.id), "Invoice marked as sent.")}>
                            <Send className="w-3.5 h-3.5" /> Send
                          </Button>
                        )}
                        {(inv.status === "sent" || inv.status === "pending_payment") && (
                          <Button size="sm" variant="outline" className="gap-1" disabled={isPending}
                            onClick={() => run(markInvoicePaid(inv.id), "Invoice marked as paid.")}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                          </Button>
                        )}
                        {inv.status !== "storno" && (
                          <Button size="sm" variant="ghost" className="text-destructive gap-1" disabled={isPending}
                            onClick={() => setStornoTarget(inv)}>
                            <Ban className="w-3.5 h-3.5" /> Void
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
                  {processing.insurance_type === "gkv" ? "Approve for KV — preview" : "Invoice preview (§12 GOÄ)"}
                </DialogTitle>
                <DialogDescription>
                  {processing.patient_name} · {fmtDate(processing.starts_at)} · draft preview
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
            <Button variant="outline" onClick={() => setProcessing(null)} disabled={isPending}>Cancel</Button>
            <Button
              disabled={isPending}
              onClick={() => processing && run(
                generateInvoice(processing.appointment_id),
                processing.insurance_type === "gkv"
                  ? "Approved for KV (queued for Quartalsabrechnung)."
                  : "Invoice generated.",
                () => setProcessing(null),
              )}
            >
              {processing?.insurance_type === "gkv" ? "Approve for KV" : "Generate Invoice"}
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
                    {viewing.insurance_type === "gkv" ? "Leistungsnachweis (GKV)" : `Invoice ${viewing.invoice_number}`}
                  </DialogTitle>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => printReport(invoiceRef.current)}>
                    <Printer className="w-4 h-4" /> Print / PDF
                  </Button>
                </div>
                <DialogDescription>{viewing.patient_name} · {fmtDate(viewing.starts_at)}</DialogDescription>
              </DialogHeader>
              <InvoiceDocument
                ref={invoiceRef}
                insuranceType={viewing.insurance_type}
                patientName={viewing.patient_name}
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
            <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              {stornoTarget && `Invoice ${stornoTarget.invoice_number} for ${stornoTarget.patient_name} will be reversed. `}
              The original is never deleted — a separate reversal invoice is issued for the audit trail
              (§14 UStG / GoBD). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Keep Invoice</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isPending}
              onClick={() => stornoTarget && run(stornoInvoice(stornoTarget.id), "Reversal invoice issued.", () => setStornoTarget(null))}
            >
              Void Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
