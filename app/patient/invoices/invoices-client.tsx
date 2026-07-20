"use client"

import Link from "next/link"
import { Receipt, Calendar, ChevronRight, AlertCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"
import type { TKey } from "@/lib/i18n/translate"

export interface PatientInvoice {
  id: string
  invoice_number: string | null
  status: string
  insurance_type: "gkv" | "pkv" | "selbstzahler"
  total_cents: number | null
  due_date: string | null
  created_at: string
}

const STATUS: Record<string, { labelKey: TKey; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending_payment: { labelKey: "patientRecords.statusPaymentDue", variant: "default" },
  sent: { labelKey: "patientRecords.statusPaymentDue", variant: "default" },
  paid: { labelKey: "patientRecords.statusPaid", variant: "outline" },
  ready_for_kv: { labelKey: "patientRecords.statusBilledToInsurance", variant: "secondary" },
  storno: { labelKey: "patientRecords.statusCancelled", variant: "destructive" },
}

const euro = (cents: number | null) =>
  cents == null ? "—" : (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })

export function PatientInvoicesClient({ invoices }: { invoices: PatientInvoice[] }) {
  const t = useT()
  const locale = useLocale()
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(INTL_LOCALE[locale], { day: "numeric", month: "short", year: "numeric" })
  const sorted = [...invoices].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  const dueCount = sorted.filter((i) => (i.status === "pending_payment" || i.status === "sent") && i.insurance_type !== "gkv").length

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">{t("patientRecords.billingTitle")}</h1>
          <p className="text-muted-foreground">{t("patientRecords.billingSubtitle")}</p>
        </div>

        {dueCount > 0 && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-300/60 bg-amber-50 text-amber-900 px-4 py-3 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/60">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm">
              {dueCount === 1 ? t("patientRecords.invoicesDueOne", { count: dueCount }) : t("patientRecords.invoicesDueMany", { count: dueCount })}
            </p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              {t("patientRecords.invoices")}
            </CardTitle>
            <CardDescription>{t("patientRecords.gkvDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {sorted.length > 0 ? (
              <div className="space-y-3">
                {sorted.map((inv) => {
                  const status = STATUS[inv.status]
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
                            {isGkv ? t("patientRecords.statutoryVisit") : `${t("patientRecords.invoiceLabel")} ${inv.invoice_number ?? ""}`.trim()}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <Badge variant="outline" className="text-xs gap-1">
                              <Calendar className="w-3 h-3" />
                              {fmtDate(inv.created_at)}
                            </Badge>
                            <Badge variant={status?.variant ?? "secondary"} className="text-xs">{status ? t(status.labelKey) : inv.status}</Badge>
                            {!isGkv && inv.due_date && (inv.status === "pending_payment" || inv.status === "sent") && (
                              <span className="text-xs text-muted-foreground">{t("patientRecords.dueLabel", { date: fmtDate(inv.due_date) })}</span>
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
                <p className="text-muted-foreground">{t("patientRecords.noInvoices")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
