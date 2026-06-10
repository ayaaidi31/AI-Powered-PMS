import React from "react"
import { CLINIC } from "@/lib/clinic"

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

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
const euro = (cents: number | null) =>
  cents == null ? "—" : (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })

const INSURANCE_LABEL = { gkv: "Gesetzlich (GKV)", pkv: "Privat (PKV)", selbstzahler: "Selbstzahler" } as const

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
  const isGkv = insuranceType === "gkv"
  const factorOf = (m: number | null) => (m == null ? null : Number(m))
  const needsJustification = items.some((i) => (factorOf(i.multiplier) ?? 0) > GOAE_THRESHOLD)

  return (
    <div ref={ref} className="report-print bg-white text-neutral-900 font-serif rounded-lg border border-neutral-200 shadow-sm p-5 sm:p-8 lg:p-10 leading-relaxed">
      {/* Letterhead */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-neutral-800 pb-4">
        <div>
          <p className="text-xl font-bold tracking-tight">{CLINIC.name}</p>
          <p className="text-xs text-neutral-600">{CLINIC.line1}</p>
          <p className="text-xs text-neutral-600">{CLINIC.line2}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">{isGkv ? "Datum" : "Rechnungs-Nr."}</p>
          <p className="font-mono text-sm font-semibold">{isGkv ? fmtDate(invoiceDate) : (invoiceNumber ?? "(bei Ausstellung)")}</p>
          {!isGkv && <p className="text-xs text-neutral-600 mt-1">Datum: {fmtDate(invoiceDate)}</p>}
        </div>
      </div>

      {/* Recipient */}
      <div className="flex flex-wrap justify-between gap-4 mt-6">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">{isGkv ? "Patient / Patientin" : "Rechnungsempfänger"}</p>
          <p className="font-semibold">{patientName}</p>
          {patientDob && <p className="text-xs text-neutral-600">geb. {fmtDate(patientDob)}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">Versicherung</p>
          <p className="text-sm">{INSURANCE_LABEL[insuranceType]}</p>
          <p className="text-xs text-neutral-600 mt-1">Behandlung: {fmtDate(serviceDate)}</p>
        </div>
      </div>

      {/* Title */}
      <h2 className="text-lg font-bold mt-8 mb-1 text-center tracking-[0.2em]">
        {isGkv ? "LEISTUNGSNACHWEIS" : "RECHNUNG"}
      </h2>
      <p className="text-center text-xs text-neutral-500 mb-4">
        {isGkv ? "Abrechnung über die Kassenärztliche Vereinigung" : "gemäß §12 GOÄ"}
      </p>

      {/* Line items */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-neutral-400 text-left text-xs uppercase tracking-wide text-neutral-600">
            <th className="py-1 pr-2">Datum</th>
            <th className="py-1 pr-2">{isGkv ? "EBM-Ziffer" : "GOÄ-Nr."}</th>
            <th className="py-1 pr-2">Leistung</th>
            <th className="py-1 px-2 text-right">Punkte</th>
            {!isGkv && <th className="py-1 px-2 text-right">Faktor</th>}
            {!isGkv && <th className="py-1 pl-2 text-right">Betrag</th>}
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

      {/* Total / settlement note */}
      {isGkv ? (
        <p className="mt-6 text-sm text-neutral-700">
          Es wird keine Rechnung an die Patientin/den Patienten gestellt. Die Leistungen werden im Rahmen der
          quartalsweisen Abrechnung (Quartalsabrechnung) mit der Kassenärztlichen Vereinigung abgerechnet.
        </p>
      ) : (
        <div className="mt-4 flex justify-end">
          <div className="text-right">
            <span className="text-sm text-neutral-600 mr-6">Gesamtbetrag</span>
            <span className="text-xl font-bold">{euro(totalCents)}</span>
          </div>
        </div>
      )}

      {/* Payment + legal notes (invoice only) */}
      {!isGkv && (
        <div className="mt-8 space-y-2 text-xs text-neutral-600 border-t border-neutral-300 pt-4">
          {dueDate && (
            <p className="text-sm text-neutral-800">
              Bitte überweisen Sie den Betrag bis zum <strong>{fmtDate(dueDate)}</strong> auf folgendes Konto:
              <br />{CLINIC.bank}
            </p>
          )}
          {needsJustification && (
            <p>* Steigerungssatz über {GOAE_THRESHOLD.toFixed(1)} — schriftliche Begründung gemäß §12 Abs. 3 GOÄ erforderlich.</p>
          )}
          <p>Heilbehandlungen sind gemäß §4 Nr. 14 UStG umsatzsteuerfrei.</p>
          <p>Rechnung gemäß §12 GOÄ (Gebührenordnung für Ärzte).</p>
        </div>
      )}

      <p className="mt-10 text-[10px] text-neutral-400 text-center">{CLINIC.name} · {CLINIC.line1}</p>
    </div>
  )
})
