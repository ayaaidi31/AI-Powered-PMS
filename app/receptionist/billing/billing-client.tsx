"use client"

/**
 * Billing dashboard (Feature 3 — UC-REC-01).
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
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Receipt, FileText, AlertCircle, CheckCircle2, Send, Ban, Landmark, Euro, Clock,
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

export interface BillingRow extends BillingWorklistRow {
  items: BillingItem[]
  total_cents: number | null
}

// GOÄ Schwellenwert for personal services — above it a written justification
// (Begründung) is legally required (§12 Abs. 3 GOÄ).
const GOAE_THRESHOLD = 2.3

const INVOICE_STATUS: Record<InvoiceRow["status"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  ready_for_kv: { label: "Ready for KV", variant: "secondary" },
  pending_payment: { label: "Pending Payment", variant: "default" },
  sent: { label: "Sent", variant: "outline" },
  paid: { label: "Paid", variant: "default" },
  storno: { label: "Storno (cancelled)", variant: "destructive" },
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE")

export function BillingClient({ rows, invoices }: { rows: BillingRow[]; invoices: InvoiceListRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [processing, setProcessing] = useState<BillingRow | null>(null)
  const [stornoTarget, setStornoTarget] = useState<InvoiceListRow | null>(null)
  const [viewing, setViewing] = useState<InvoiceListRow | null>(null)

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
                        {inv.insurance_type !== "gkv" && inv.status !== "storno" && (
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
                            <Ban className="w-3.5 h-3.5" /> Storno
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

      {/* Process dialog (GKV statement OR §12 GOÄ invoice preview) */}
      <Dialog open={processing !== null} onOpenChange={(o) => !o && setProcessing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {processing && (
            processing.insurance_type === "gkv" ? (
              <GkvView row={processing} />
            ) : (
              <Goae12View row={processing} draft />
            )
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

      {/* View an issued GOÄ invoice */}
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewing && (
            <Goae12ViewIssued invoice={viewing} rows={rows} />
          )}
        </DialogContent>
      </Dialog>

      {/* Storno confirmation */}
      <AlertDialog open={stornoTarget !== null} onOpenChange={(o) => !o && setStornoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this invoice (Storno)?</AlertDialogTitle>
            <AlertDialogDescription>
              {stornoTarget && `Invoice ${stornoTarget.invoice_number} for ${stornoTarget.patient_name} will be reversed. `}
              The original is never deleted — a separate storno invoice is issued for the audit trail
              (§14 UStG / GoBD). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Keep Invoice</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isPending}
              onClick={() => stornoTarget && run(stornoInvoice(stornoTarget.id), "Storno invoice issued.", () => setStornoTarget(null))}
            >
              Issue Storno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** GKV (statutory) processing view — codes only, no € to the patient. */
function GkvView({ row }: { row: BillingRow }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Landmark className="w-5 h-5" /> Statutory billing (GKV)</DialogTitle>
        <DialogDescription>
          {row.patient_name} · {fmtDate(row.starts_at)}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="rounded-lg border border-border p-3 bg-muted/40 text-sm">
          No invoice is issued to the patient. The validated EBM services are queued for the
          <strong> quarterly KV submission (Quartalsabrechnung)</strong> and settled by the
          Kassenärztliche Vereinigung.
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>EBM-Ziffer</TableHead><TableHead>Leistung</TableHead><TableHead className="text-right">Punkte</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {row.items.map((it, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono">{it.code}</TableCell>
                <TableCell>{it.description}</TableCell>
                <TableCell className="text-right">{it.points ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

/** §12 GOÄ invoice preview for a draft (worklist) entry. */
function Goae12View({ row, draft }: { row: BillingRow; draft?: boolean }) {
  const needsJustification = row.items.some((i) => (i.multiplier ?? 0) > GOAE_THRESHOLD)
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" /> Invoice (§12 GOÄ)</DialogTitle>
        <DialogDescription>
          {insuranceLabel(row.insurance_type)} · {row.patient_name} · service date {fmtDate(row.starts_at)}
          {draft && " · draft preview"}
        </DialogDescription>
      </DialogHeader>
      <Goae12Body
        patientName={row.patient_name}
        serviceDate={row.starts_at}
        items={row.items}
        total={row.total_cents ?? 0}
        invoiceNumber={null}
        needsJustification={needsJustification}
      />
    </>
  )
}

/** §12 GOÄ view for an already-issued invoice (looks up its items from rows). */
function Goae12ViewIssued({ invoice, rows }: { invoice: InvoiceListRow; rows: BillingRow[] }) {
  const row = rows.find((r) => r.appointment_id === invoice.appointment_id)
  const items = row?.items ?? []
  const needsJustification = items.some((i) => (i.multiplier ?? 0) > GOAE_THRESHOLD)
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" /> Invoice {invoice.invoice_number}</DialogTitle>
        <DialogDescription>{invoice.patient_name} · {fmtDate(invoice.starts_at)}</DialogDescription>
      </DialogHeader>
      <Goae12Body
        patientName={invoice.patient_name}
        serviceDate={invoice.starts_at}
        items={items}
        total={invoice.total_cents ?? 0}
        invoiceNumber={invoice.invoice_number}
        dueDate={invoice.due_date}
        needsJustification={needsJustification}
      />
    </>
  )
}

/** The shared §12-compliant invoice body (mandatory fields per §12 GOÄ). */
function Goae12Body({
  patientName, serviceDate, items, total, invoiceNumber, dueDate, needsJustification,
}: {
  patientName: string
  serviceDate: string
  items: BillingItem[]
  total: number
  invoiceNumber: string | null
  dueDate?: string | null
  needsJustification: boolean
}) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex justify-between border-b border-border pb-3">
        <div>
          <p className="font-semibold text-foreground">AI-PMS Clinic</p>
          <p className="text-muted-foreground text-xs">Musterstraße 1 · 10115 Berlin</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">Rechnung-Nr.</p>
          <p className="font-mono">{invoiceNumber ?? "(allocated on issue)"}</p>
          <p className="text-muted-foreground text-xs mt-1">Datum: {fmtDate(serviceDate)}</p>
        </div>
      </div>

      <div>
        <p className="text-muted-foreground text-xs">Rechnungsempfänger</p>
        <p className="font-medium">{patientName}</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Datum</TableHead>
            <TableHead>Nr.</TableHead>
            <TableHead>Leistung</TableHead>
            <TableHead className="text-right">Punkte</TableHead>
            <TableHead className="text-right">Faktor</TableHead>
            <TableHead className="text-right">Betrag</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it, i) => (
            <TableRow key={i}>
              <TableCell>{fmtDate(serviceDate)}</TableCell>
              <TableCell className="font-mono">{it.code}</TableCell>
              <TableCell>{it.description}{(it.multiplier ?? 0) > GOAE_THRESHOLD && <span className="text-amber-600"> *</span>}</TableCell>
              <TableCell className="text-right">{it.points ?? "—"}</TableCell>
              <TableCell className="text-right">{it.multiplier?.toFixed(1) ?? "—"}</TableCell>
              <TableCell className="text-right">{formatCents(it.amount_cents)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex justify-end">
        <div className="text-right">
          <span className="text-muted-foreground mr-4">Gesamtbetrag</span>
          <span className="text-lg font-bold">{formatCents(total)}</span>
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-3">
        {dueDate && <p><Clock className="w-3 h-3 inline mr-1" />Zahlbar bis {fmtDate(dueDate)}.</p>}
        {needsJustification && (
          <p className="text-amber-600">* Steigerungssatz über {GOAE_THRESHOLD.toFixed(1)} — schriftliche Begründung gemäß §12 Abs. 3 GOÄ erforderlich.</p>
        )}
        <p>Heilbehandlungen sind gemäß §4 Nr. 14 UStG umsatzsteuerfrei.</p>
        <p>Rechnung gemäß §12 GOÄ (Gebührenordnung für Ärzte).</p>
      </div>
    </div>
  )
}
