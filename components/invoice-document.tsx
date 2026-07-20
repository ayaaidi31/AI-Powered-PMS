"use client"

import React from "react"
import { CLINIC } from "@/lib/clinic"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"

interface InvoiceLine {
  catalog: "EBM" | "GOAE"
  code: string
  description: string
  points: number | null
  multiplier: number | null
  amount_cents: number | null
}

interface Props {
  insuranceType: "gkv" | "pkv" | "selbstzahler"
  patientName: string
  patientDob?: string | null
  invoiceNumber: string | null
  invoiceDate: string
  serviceDate: string
  dueDate?: string | null
  items: InvoiceLine[]
  totalCents: number | null
}

// GOÄ Schwellenwert — above it a written justification is required (§12 Abs. 3).
const GOAE_THRESHOLD = 2.3

/**
 * A finalised billing document. For private/self-pay patients it is a §12 GOÄ
 * invoice (Rechnung) with all mandatory fields; for statutory (GKV) patients it
 * is a Leistungsnachweis, since the patient is not invoiced (the services are
 * settled with the KV). Print-friendly serif document.
 */
export const InvoiceDocument = React.forwardRef<HTMLDivElement, Props>(function InvoiceDocument(
  { insuranceType, patientName, patientDob, invoiceNumber, invoiceDate, serviceDate, dueDate, items, totalCents },
  ref,
) {
  const t = useT()
  const locale = useLocale()
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(INTL_LOCALE[locale], { day: "2-digit", month: "2-digit", year: "numeric" })
  const euro = (cents: number | null) =>
    cents == null ? "—" : (cents / 100).toLocaleString(INTL_LOCALE[locale], { style: "currency", currency: "EUR" })
  const INSURANCE_LABEL = {
    gkv: t("invoiceDoc.insGkv"),
    pkv: t("invoiceDoc.insPkv"),
    selbstzahler: t("invoiceDoc.insSelbstzahler"),
  } as const

  const isGkv = insuranceType === "gkv"
  const factorOf = (m: number | null) => (m == null ? null : Number(m))
  const needsJustification = items.some((i) => (factorOf(i.multiplier) ?? 0) > GOAE_THRESHOLD)

  return (
    <div ref={ref} className="report-print w-full min-w-0 max-w-full bg-white text-neutral-900 font-serif rounded-lg border border-neutral-200 shadow-sm p-5 sm:p-8 lg:p-10 leading-relaxed">
      {/* Letterhead */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-neutral-800 pb-4">
        <div>
          <p className="text-xl font-bold tracking-tight">{CLINIC.name}</p>
          <p className="text-xs text-neutral-600">{CLINIC.line1}</p>
          <p className="text-xs text-neutral-600">{CLINIC.line2}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">{isGkv ? t("invoiceDoc.date") : t("invoiceDoc.invoiceNumber")}</p>
          <p className="font-mono text-sm font-semibold">{isGkv ? fmtDate(invoiceDate) : (invoiceNumber ?? t("invoiceDoc.onIssue"))}</p>
          {!isGkv && <p className="text-xs text-neutral-600 mt-1">{t("invoiceDoc.dateLabel")} {fmtDate(invoiceDate)}</p>}
        </div>
      </div>

      {/* Recipient */}
      <div className="flex flex-wrap justify-between gap-4 mt-6">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">{isGkv ? t("invoiceDoc.patient") : t("invoiceDoc.billTo")}</p>
          <p className="font-semibold">{patientName}</p>
          {patientDob && <p className="text-xs text-neutral-600">{t("invoiceDoc.born")} {fmtDate(patientDob)}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">{t("invoiceDoc.insurance")}</p>
          <p className="text-sm">{INSURANCE_LABEL[insuranceType]}</p>
          <p className="text-xs text-neutral-600 mt-1">{t("invoiceDoc.serviceLabel")} {fmtDate(serviceDate)}</p>
        </div>
      </div>

      {/* Title */}
      <h2 className="text-base sm:text-lg font-bold mt-8 mb-1 text-center tracking-[0.1em] sm:tracking-[0.2em] break-words">
        {isGkv ? t("invoiceDoc.titleGkv") : t("invoiceDoc.titleInvoice")}
      </h2>
      <p className="text-center text-xs text-neutral-500 mb-4">
        {isGkv ? t("invoiceDoc.subtitleGkv") : t("invoiceDoc.subtitleInvoice")}
      </p>

      {/* Line items — scrolls horizontally on narrow screens instead of clipping. */}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-sm border-collapse">
        <thead>
          <tr className="border-b border-neutral-400 text-left text-xs uppercase tracking-wide text-neutral-600">
            <th className="py-1 pr-2">{t("invoiceDoc.date")}</th>
            <th className="py-1 pr-2">{isGkv ? t("invoiceDoc.ebmCode") : t("invoiceDoc.goaeNo")}</th>
            <th className="py-1 pr-2">{t("invoiceDoc.service")}</th>
            <th className="py-1 px-2 text-right">{t("invoiceDoc.points")}</th>
            {!isGkv && <th className="py-1 px-2 text-right">{t("invoiceDoc.factor")}</th>}
            {!isGkv && <th className="py-1 pl-2 text-right">{t("invoiceDoc.amount")}</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-neutral-200 align-top">
              <td className="py-1.5 pr-2 whitespace-nowrap">{fmtDate(serviceDate)}</td>
              <td className="py-1.5 pr-2 font-mono">{it.code}</td>
              <td className="py-1.5 pr-2">
                {it.description}
                {!isGkv && (factorOf(it.multiplier) ?? 0) > GOAE_THRESHOLD && <span className="text-neutral-500"> *</span>}
              </td>
              <td className="py-1.5 px-2 text-right">{it.points ?? "—"}</td>
              {!isGkv && <td className="py-1.5 px-2 text-right">{factorOf(it.multiplier)?.toFixed(1) ?? "—"}</td>}
              {!isGkv && <td className="py-1.5 pl-2 text-right whitespace-nowrap">{euro(it.amount_cents)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Total / settlement note */}
      {isGkv ? (
        <p className="mt-6 text-sm text-neutral-700">
          {t("invoiceDoc.gkvSettlement")}
        </p>
      ) : (
        <div className="mt-4 flex justify-end">
          <div className="text-right">
            <span className="text-sm text-neutral-600 mr-6">{t("invoiceDoc.total")}</span>
            <span className="text-xl font-bold">{euro(totalCents)}</span>
          </div>
        </div>
      )}

      {/* Payment + legal notes (invoice only) */}
      {!isGkv && (
        <div className="mt-8 space-y-2 text-xs text-neutral-600 border-t border-neutral-300 pt-4">
          {dueDate && (
            <p className="text-sm text-neutral-800">
              {t("invoiceDoc.payableBefore")} <strong>{fmtDate(dueDate)}</strong> {t("invoiceDoc.payableAccount")}
              <br />{CLINIC.bank}
            </p>
          )}
          {needsJustification && (
            <p>{t("invoiceDoc.justification", { threshold: GOAE_THRESHOLD.toFixed(1) })}</p>
          )}
          <p>{t("invoiceDoc.vatExempt")}</p>
          <p>{t("invoiceDoc.legalBasis")}</p>
        </div>
      )}

      <p className="mt-10 text-[10px] text-neutral-400 text-center">{CLINIC.name} · {CLINIC.line1}</p>
    </div>
  )
})
