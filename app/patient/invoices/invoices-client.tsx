"use client"

import Link from "next/link"
import { Receipt, Calendar, ChevronRight, AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export interface PatientInvoice {
  id: string
  invoice_number: string | null
  status: string
  insurance_type: "gkv" | "pkv" | "selbstzahler"
  total_cents: number | null
  due_date: string | null
  created_at: string
}

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending_payment: { label: "Payment due", variant: "default" },
  sent: { label: "Payment due", variant: "default" },
  paid: { label: "Paid", variant: "outline" },
  ready_for_kv: { label: "Billed to insurance", variant: "secondary" },
  storno: { label: "Cancelled", variant: "destructive" },
}

const euro = (cents: number | null) =>
  cents == null ? "—" : (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

export function PatientInvoicesClient({ invoices }: { invoices: PatientInvoice[] }) {
  const sorted = [...invoices].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  const dueCount = sorted.filter((i) => (i.status === "pending_payment" || i.status === "sent") && i.insurance_type !== "gkv").length

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Billing</h1>
          <p className="text-muted-foreground">Your invoices and payment status</p>
        </div>

        {dueCount > 0 && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-300/60 bg-amber-50 text-amber-900 px-4 py-3 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/60">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm">
              You have <span className="font-semibold">{dueCount}</span> invoice{dueCount > 1 ? "s" : ""} awaiting payment.
            </p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              Invoices
            </CardTitle>
            <CardDescription>Statutory (GKV) visits are settled with your insurance — no payment needed.</CardDescription>
          </CardHeader>
          <CardContent>
            {sorted.length > 0 ? (
              <div className="space-y-3">
                {sorted.map((inv) => {
                  const status = STATUS[inv.status] ?? { label: inv.status, variant: "secondary" as const }
                  const isGkv = inv.insurance_type === "gkv"
                  const clickable = !isGkv && inv.status !== "storno"
                  const Row = (
                    <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Receipt className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-foreground truncate">
                            {isGkv ? "Statutory visit" : `Invoice ${inv.invoice_number ?? ""}`.trim()}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <Badge variant="outline" className="text-xs gap-1">
                              <Calendar className="w-3 h-3" />
                              {fmtDate(inv.created_at)}
                            </Badge>
                            <Badge variant={status.variant} className="text-xs">{status.label}</Badge>
                            {!isGkv && inv.due_date && (inv.status === "pending_payment" || inv.status === "sent") && (
                              <span className="text-xs text-muted-foreground">Due {fmtDate(inv.due_date)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-semibold text-foreground tabular-nums">{isGkv ? "—" : euro(inv.total_cents)}</span>
                        {clickable && <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                      </div>
                    </div>
                  )
                  return clickable ? (
                    <Link key={inv.id} href={`/patient/invoices/${inv.id}`} className="block">{Row}</Link>
                  ) : (
                    <div key={inv.id}>{Row}</div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Receipt className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No invoices yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
