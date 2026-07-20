"use client"

/**
 * The consolidated, printable consultation record for a single visit. Renders
 * vitals, diagnosis, report, prescriptions and billing in one canonical view.
 * Unsigned records can be signed (approveReport) behind a confirmation; once
 * signed they are immutable and become part of the patient's permanent history
 * that the AI features (Records Q&A, history briefing) draw on.
 */
import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Printer, CheckCircle2, Activity, Stethoscope, Pill, Receipt, FileText, Lock, ClipboardList,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { ReportContent } from "@/components/report-content"
import { printReport } from "@/lib/print-element"
import { formatCents } from "@/lib/display"
import { approveReport } from "@/lib/actions/reports"
import type { MedicalReportRow, VitalsRow, InvoiceRow } from "@/lib/seed-data"
import type { ReportBillingCodeDetail } from "@/lib/queries"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"
import type { TKey } from "@/lib/i18n/translate"

const REPORT_STATUS_CLS: Record<MedicalReportRow["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
}
const REPORT_STATUS_LABEL_KEY: Record<MedicalReportRow["status"], TKey> = {
  draft: "reports.statusDraft",
  pending_approval: "reports.statusPendingSignature",
  approved: "reports.statusSigned",
}

const INVOICE_STATUS_KEY: Record<InvoiceRow["status"], TKey> = {
  ready_for_kv: "reports.invoiceReadyForKv",
  pending_payment: "reports.invoicePendingPayment",
  sent: "reports.invoiceSent",
  paid: "reports.invoicePaid",
  storno: "reports.invoiceCancelled",
}

function ageFrom(dob: string): number | null {
  const d = new Date(dob); if (isNaN(+d)) return null
  const now = new Date(); let a = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
  return a
}

interface Props {
  report: MedicalReportRow
  patient: { name: string; dob: string; insurance: string } | null
  doctor: { name: string; specialization: string | null; lanr: string | null }
  appointment: { starts_at: string; reason: string | null; status: string } | null
  vitals: VitalsRow | null
  codes: ReportBillingCodeDetail[]
  invoice: InvoiceRow | null
}

export function ConsultationRecordClient({ report, patient, doctor, appointment, vitals, codes, invoice }: Props) {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const [signOpen, setSignOpen] = useState(false)
  const recordRef = useRef<HTMLDivElement>(null)

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(INTL_LOCALE[locale], { day: "2-digit", month: "long", year: "numeric" })
  const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short" })

  const signed = report.status === "approved"
  const reportText = report.formatted_report?.trim() || report.raw_notes?.trim() || null
  const rx = (report.prescriptions ?? []).filter((p) => p.medication?.trim())
  const age = patient ? ageFrom(patient.dob) : null

  function confirmSign() {
    startTransition(async () => {
      const r = await approveReport(report.id)
      if (r.status === "ok") {
        toast.success(t("reports.recordSigned"))
        router.refresh()
      } else {
        toast.error(r.message)
      }
      setSignOpen(false)
    })
  }

  const hasVitals = vitals && (vitals.systolic || vitals.heart_rate || vitals.temperature_c || vitals.weight_kg || vitals.height_cm)

  return (
    <>
      {/* Action bar — not part of the printed record */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t("reports.recordTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {appointment ? fmtDate(appointment.starts_at) : fmtDate(report.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => printReport(recordRef.current)}>
            <Printer className="w-4 h-4" /> {t("reports.printPdf")}
          </Button>
          {signed ? (
            <Badge className="gap-1.5 h-9 px-3 bg-emerald-600 text-white hover:bg-emerald-600">
              <Lock className="w-3.5 h-3.5" /> {t("reports.statusSigned")}
            </Badge>
          ) : (
            <Button className="gap-2" onClick={() => setSignOpen(true)} disabled={isPending}>
              <CheckCircle2 className="w-4 h-4" /> {t("reports.signFinalise")}
            </Button>
          )}
        </div>
      </div>

      {/* The printable record */}
      <div ref={recordRef} className="report-print space-y-4">
        {/* Header */}
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-lg font-bold text-foreground">{patient?.name ?? t("reports.unknownPatient")}</p>
                <p className="text-sm text-muted-foreground">
                  {age !== null && <>{t("reports.yearsOld", { age })} · </>}
                  {patient && <>{t("reports.bornPrefix")} {fmtDate(patient.dob)} · </>}
                  {patient?.insurance}
                </p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${REPORT_STATUS_CLS[report.status]}`}>{t(REPORT_STATUS_LABEL_KEY[report.status])}</span>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="flex justify-between gap-2 border-b border-border/60 pb-1">
                <span className="text-muted-foreground">{t("reports.visit")}</span>
                <span className="text-foreground text-right">{appointment ? fmtDateTime(appointment.starts_at) : "—"}</span>
              </div>
              <div className="flex justify-between gap-2 border-b border-border/60 pb-1">
                <span className="text-muted-foreground">{t("reports.physician")}</span>
                <span className="text-foreground text-right">{doctor.name}{doctor.specialization ? ` · ${doctor.specialization}` : ""}</span>
              </div>
              {appointment?.reason && (
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1 sm:col-span-2">
                  <span className="text-muted-foreground">{t("reports.reasonForVisit")}</span>
                  <span className="text-foreground text-right">{appointment.reason}</span>
                </div>
              )}
              {doctor.lanr && (
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1">
                  <span className="text-muted-foreground">LANR</span>
                  <span className="text-foreground text-right font-mono">{doctor.lanr}</span>
                </div>
              )}
              {signed && report.approved_at && (
                <div className="flex justify-between gap-2 border-b border-border/60 pb-1">
                  <span className="text-muted-foreground">{t("reports.statusSigned")}</span>
                  <span className="text-foreground text-right">{fmtDateTime(report.approved_at)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Vitals */}
        {hasVitals && (
          <Section icon={<Activity className="w-4 h-4 text-primary" />} title={t("reports.vitals")}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {vitals!.systolic && vitals!.diastolic && <Vital label={t("reports.bloodPressure")} value={`${vitals!.systolic}/${vitals!.diastolic}`} unit="mmHg" />}
              {vitals!.heart_rate && <Vital label={t("reports.heartRate")} value={`${vitals!.heart_rate}`} unit="bpm" />}
              {vitals!.temperature_c && <Vital label={t("reports.temperature")} value={`${vitals!.temperature_c}`} unit="°C" />}
              {vitals!.weight_kg && <Vital label={t("reports.weight")} value={`${vitals!.weight_kg}`} unit="kg" />}
              {vitals!.height_cm && <Vital label={t("reports.height")} value={`${vitals!.height_cm}`} unit="cm" />}
            </div>
          </Section>
        )}

        {/* Diagnosis */}
        <Section icon={<Stethoscope className="w-4 h-4 text-primary" />} title={t("reports.diagnosis")}>
          <p className="text-sm text-foreground">{report.diagnosis?.trim() || <span className="text-muted-foreground">{t("reports.noDiagnosis")}</span>}</p>
        </Section>

        {/* Report */}
        <Section icon={<FileText className="w-4 h-4 text-primary" />} title={t("reports.clinicalReport")}>
          {reportText ? (
            <ReportContent text={reportText} className="text-sm" />
          ) : (
            <p className="text-sm text-muted-foreground">{t("reports.noReport")}</p>
          )}
        </Section>

        {/* Prescriptions */}
        {rx.length > 0 && (
          <Section icon={<Pill className="w-4 h-4 text-primary" />} title={t("reports.prescriptions")}>
            <ul className="space-y-1.5">
              {rx.map((p, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-sm border-b border-border/60 pb-1.5 last:border-0">
                  <span className="font-medium text-foreground">{p.medication}</span>
                  <span className="text-muted-foreground text-right">{[p.dosage, p.frequency].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Billing */}
        {(codes.length > 0 || invoice) && (
          <Section icon={<Receipt className="w-4 h-4 text-primary" />} title={t("reports.billing")}>
            {codes.length > 0 && (
              <ul className="space-y-1.5 mb-3">
                {codes.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-3 text-sm border-b border-border/60 pb-1.5">
                    <span className="text-foreground">
                      <span className="font-mono font-medium">{c.catalog} {c.code}</span>
                      {c.description && <span className="text-muted-foreground"> — {c.description}</span>}
                    </span>
                    {c.multiplier != null && <span className="text-muted-foreground whitespace-nowrap">×{Number(c.multiplier).toFixed(1)}</span>}
                  </li>
                ))}
              </ul>
            )}
            {invoice ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("reports.invoiceLabel")} <span className="font-mono text-foreground">{invoice.invoice_number}</span> · {t(INVOICE_STATUS_KEY[invoice.status])}
                </span>
                {invoice.total_cents != null && <span className="font-semibold text-foreground">{formatCents(invoice.total_cents)}</span>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("reports.noInvoice")}</p>
            )}
          </Section>
        )}

        {/* Internal notes (doctor-only) */}
        {report.internal_notes?.trim() && (
          <Section icon={<ClipboardList className="w-4 h-4 text-primary" />} title={t("reports.internalNotes")}>
            <p className="text-sm text-foreground whitespace-pre-wrap">{report.internal_notes}</p>
          </Section>
        )}
      </div>

      {/* Sign confirmation */}
      <AlertDialog open={signOpen} onOpenChange={(o) => !o && setSignOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reports.signConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("reports.signConfirmDesc1", { name: patient?.name ?? t("reports.thePatient") })}
              <strong>{t("reports.signConfirmDescStrong")}</strong>
              {t("reports.signConfirmDesc2")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSign} disabled={isPending}>
              {isPending ? t("reports.signing") : t("reports.signFinalise")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">{icon}{title}</h2>
        {children}
      </CardContent>
    </Card>
  )
}

function Vital({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value} <span className="text-xs font-normal text-muted-foreground">{unit}</span></p>
    </div>
  )
}
