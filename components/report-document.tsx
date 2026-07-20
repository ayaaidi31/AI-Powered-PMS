"use client"

import React from "react"
import type { PrescriptionItem } from "@/lib/seed-data"
import { CLINIC } from "@/lib/clinic"
import { ReportContent } from "./report-content"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"

interface Props {
  doctorName: string
  doctorSpecialization?: string | null
  doctorLanr?: string | null
  patientName: string
  patientDob?: string | null
  date: string
  diagnosis?: string | null
  body?: string | null
  rawNotes?: string | null
  prescriptions?: PrescriptionItem[]
}

/**
 * A finalised medical report presented as a formal Arztbericht: clinic
 * letterhead, patient/date metadata, the structured body, and a signature
 * block, in a print-friendly serif document.
 */
export const ReportDocument = React.forwardRef<HTMLDivElement, Props>(function ReportDocument({
  doctorName, doctorSpecialization, doctorLanr, patientName, patientDob, date, diagnosis, body, rawNotes, prescriptions,
}, ref) {
  const t = useT()
  const locale = useLocale()
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(INTL_LOCALE[locale], { day: "2-digit", month: "long", year: "numeric" })
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
          <p className="text-sm font-semibold">{doctorName}</p>
          {doctorSpecialization && <p className="text-xs text-neutral-600">{doctorSpecialization}</p>}
          {doctorLanr && <p className="text-xs text-neutral-600">LANR: {doctorLanr}</p>}
        </div>
      </div>

      {/* Patient / date metadata */}
      <div className="flex flex-wrap justify-between gap-4 mt-6">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">{t("reportDoc.patient")}</p>
          <p className="font-semibold">{patientName}</p>
          {patientDob && <p className="text-xs text-neutral-600">{t("reportDoc.born")} {fmtDate(patientDob)}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">{t("reportDoc.date")}</p>
          <p className="font-semibold">{fmtDate(date)}</p>
        </div>
      </div>

      {/* Title */}
      <h2 className="text-lg font-bold mt-8 mb-4 text-center tracking-[0.2em]">{t("reportDoc.title")}</h2>

      {/* Body */}
      <div className="[&_h4]:text-neutral-900 [&_p]:text-neutral-800">
        {body ? (
          <ReportContent text={body} />
        ) : (
          <div className="space-y-3 text-sm">
            {diagnosis && <p><span className="font-semibold">{t("reportDoc.diagnosisLabel")} </span>{diagnosis}</p>}
            {rawNotes && <p className="whitespace-pre-wrap">{rawNotes}</p>}
          </div>
        )}
      </div>

      {/* Prescriptions */}
      {prescriptions && prescriptions.length > 0 && (
        <div className="mt-6">
          <p className="font-semibold mb-1">{t("reportDoc.prescriptions")}</p>
          <ul className="list-disc pl-5 text-sm text-neutral-800">
            {prescriptions.map((rx, i) => <li key={i}>{rx.medication} — {rx.dosage}, {rx.frequency}</li>)}
          </ul>
        </div>
      )}

      {/* Signature */}
      <div className="mt-12 flex justify-end">
        <div className="text-center">
          <p className="text-xs text-neutral-600 mb-8 text-left">{t("reportDoc.signatureLine", { city: CLINIC.city, date: fmtDate(date) })}</p>
          <div className="w-56 border-t border-neutral-700 pt-1" />
          <p className="text-sm font-semibold">{doctorName}</p>
          {doctorSpecialization && <p className="text-xs text-neutral-600">{doctorSpecialization}</p>}
          {doctorLanr && <p className="text-xs text-neutral-600">LANR: {doctorLanr}</p>}
        </div>
      </div>
    </div>
  )
})
