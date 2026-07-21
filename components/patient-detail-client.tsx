"use client"

/**
 * Shared read-only patient profile for staff (doctor & receptionist): profile,
 * clinical summary, reports (open as a printable document), appointment history,
 * and billing documents. Editing of reports/invoices happens in their dedicated
 * areas; this view is for review, navigation and printing. `backHref` points the
 * "Back to patients" link at the calling portal's list.
 */
import { useState, useRef } from "react"
import Link from "next/link"
import {
  ArrowLeft, User, Mail, Phone, MapPin, Shield, AlertCircle, Activity, Heart,
  Thermometer, Pill, FileText, Calendar, ClipboardList, Search, Printer, Clock,
  Stethoscope, ChevronRight, UserCheck, Receipt, Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { PatientRow, VitalsRow, PrescriptionItem, MedicalReportRow, InvoiceRow, PatientDocumentRow } from "@/lib/seed-data"
import type { BillingItem } from "@/lib/queries"
import { patientName, initials, insuranceLabel, insuranceVariant, formatCents } from "@/lib/display"
import { ReportDocument } from "@/components/report-document"
import { InvoiceDocument } from "@/components/invoice-document"
import { PatientDocuments } from "@/components/patient-documents"
import { PatientFormDialog } from "@/components/patient-form-dialog"
import { printReport } from "@/lib/print-element"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"
import type { TKey } from "@/lib/i18n/translate"

interface ReportItem {
  id: string
  diagnosis: string | null
  formatted_report: string | null
  raw_notes: string | null
  prescriptions: PrescriptionItem[]
  status: MedicalReportRow["status"]
  created_at: string
  approved_at: string | null
  doctorName: string
  doctorSpecialization: string | null
  doctorLanr: string | null
}
interface AppointmentItem {
  id: string
  starts_at: string
  status: string
  reason: string | null
  durationMin: number
  checkInAt: string | null
  doctorName: string
}
interface Clinical {
  allergies: string[]
  conditions: string[]
  medications: { name: string; dosage: string; frequency: string }[]
  vitals: VitalsRow | null
}
interface BillingDoc {
  id: string
  invoiceNumber: string
  insuranceType: "gkv" | "pkv" | "selbstzahler"
  insurerName: string | null
  insuranceNumber: string | null
  totalCents: number | null
  status: InvoiceRow["status"]
  dueDate: string | null
  invoiceDate: string
  serviceDate: string
  items: BillingItem[]
}

export interface PatientDetailData {
  patient: PatientRow
  clinical: Clinical
  reports: ReportItem[]
  appointments: AppointmentItem[]
  billing: BillingDoc[]
  documents: PatientDocumentRow[]
}

const INVOICE_STATUS_KEY: Record<InvoiceRow["status"], TKey> = {
  ready_for_kv: "patientDetail.invoiceQueuedKv",
  pending_payment: "patientDetail.invoicePendingPayment",
  sent: "patientDetail.invoiceSent",
  paid: "patientDetail.invoicePaid",
  storno: "patientDetail.invoiceVoided",
}

const REPORT_STATUS_VARIANT: Record<MedicalReportRow["status"], "default" | "secondary" | "outline"> = {
  draft: "outline",
  pending_approval: "secondary",
  approved: "default",
}
const REPORT_STATUS_KEY: Record<MedicalReportRow["status"], TKey> = {
  draft: "patientDetail.reportStatusDraft",
  pending_approval: "patientDetail.reportStatusPending",
  approved: "patientDetail.reportStatusApproved",
}

function age(birthDate: string) {
  const b = new Date(birthDate)
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--
  return a
}

export function PatientDetailClient({
  patient, clinical, reports, appointments, billing, documents,
  backHref = "/doctor/patients", viewerRole = "doctor", currentUserId = null,
}: PatientDetailData & {
  backHref?: string
  viewerRole?: "doctor" | "receptionist"
  currentUserId?: string | null
}) {
  const t = useT()
  const locale = useLocale()
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(INTL_LOCALE[locale])
  const [viewing, setViewing] = useState<ReportItem | null>(null)
  const [viewingAppt, setViewingAppt] = useState<AppointmentItem | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<BillingDoc | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const invoiceRef = useRef<HTMLDivElement>(null)
  const [reportQuery, setReportQuery] = useState("")
  const [apptQuery, setApptQuery] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const v = clinical.vitals

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString(INTL_LOCALE[locale], { dateStyle: "long", timeStyle: "short" })

  const reportsFiltered = reports.filter((r) =>
    `${r.diagnosis ?? ""} ${t(REPORT_STATUS_KEY[r.status])} ${fmtDate(r.created_at)}`.toLowerCase().includes(reportQuery.toLowerCase()),
  )
  const apptsFiltered = appointments.filter((a) =>
    `${a.reason ?? ""} ${a.status} ${fmtDate(a.starts_at)}`.toLowerCase().includes(apptQuery.toLowerCase()),
  )

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> {t("patientDetail.backToPatients")}
        </Link>
        {viewerRole === "receptionist" && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4" /> {t("patientDetail.editPatient")}
          </Button>
        )}
      </div>

      {viewerRole === "receptionist" && (
        <PatientFormDialog open={editOpen} onOpenChange={setEditOpen} patient={patient} />
      )}

      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                {initials(patient.first_name, patient.last_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">{patientName(patient)}</h1>
                <Badge variant={insuranceVariant(patient.insurance_type)}>{insuranceLabel(patient.insurance_type)}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                <span>{t("patientDetail.yearsOld", { age: age(patient.birth_date) })}</span>
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{fmtDate(patient.birth_date)}</span>
                {patient.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{patient.email}</span>}
                {patient.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{patient.phone}</span>}
                {(patient.street || patient.city) && (
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{[patient.street, patient.postal_code, patient.city].filter(Boolean).join(", ")}</span>
                )}
              </div>
            </div>
          </div>
          {clinical.allergies.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {clinical.allergies.map((a, i) => (
                <Badge key={i} variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />{a}</Badge>
              ))}
            </div>
          )}
          {(patient.insurer_name || patient.versicherten_id || patient.insurer_ik || patient.guardian_name || patient.guardian_contact) && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
              {patient.insurer_name && <AdminField label={t("patientDetail.provider")} value={patient.insurer_name} />}
              {patient.versicherten_id && <AdminField label={t("patientDetail.insuranceNumber")} value={patient.versicherten_id} mono />}
              {patient.insurer_ik && <AdminField label={t("patientDetail.insurerIk")} value={patient.insurer_ik} mono />}
              {(patient.guardian_name || patient.guardian_contact) && (
                <AdminField label={t("patientDetail.guardian")} value={[patient.guardian_name, patient.guardian_contact].filter(Boolean).join(" · ")} />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Clinical summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4 text-primary" />{t("patientDetail.clinicalSummary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">{t("patientDetail.chronicConditions")}</p>
              {clinical.conditions.length ? (
                <div className="flex flex-wrap gap-1.5">{clinical.conditions.map((c, i) => <Badge key={i} variant="secondary">{c}</Badge>)}</div>
              ) : <p className="text-muted-foreground">{t("patientDetail.noneRecorded")}</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">{t("patientDetail.currentMedications")}</p>
              {clinical.medications.length ? (
                <div className="space-y-1">
                  {clinical.medications.map((m, i) => (
                    <div key={i} className="flex items-center gap-2"><Pill className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="font-medium">{m.name}</span><span className="text-muted-foreground">{m.dosage} · {m.frequency}</span></div>
                  ))}
                </div>
              ) : <p className="text-muted-foreground">{t("patientDetail.noneRecorded")}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Latest vitals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-primary" />{t("patientDetail.latestVitals")}</CardTitle>
            {v && <CardDescription>{t("patientDetail.recordedOn", { date: fmtDate(v.recorded_at) })}</CardDescription>}
          </CardHeader>
          <CardContent>
            {v ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <VitalTile icon={<Activity className="w-3.5 h-3.5" />} label={t("patientDetail.bloodPressure")} value={v.systolic != null ? `${v.systolic}/${v.diastolic}` : "—"} unit="mmHg" />
                <VitalTile icon={<Heart className="w-3.5 h-3.5" />} label={t("patientDetail.heartRate")} value={v.heart_rate != null ? `${v.heart_rate}` : "—"} unit="bpm" />
                <VitalTile icon={<Thermometer className="w-3.5 h-3.5" />} label={t("patientDetail.temperature")} value={v.temperature_c != null ? `${v.temperature_c}` : "—"} unit="°C" />
                <VitalTile icon={<User className="w-3.5 h-3.5" />} label={t("patientDetail.weight")} value={v.weight_kg != null ? `${v.weight_kg}` : "—"} unit="kg" />
              </div>
            ) : <p className="text-sm text-muted-foreground">{t("patientDetail.noVitals")}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Reports */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />{t("patientDetail.reports")}</CardTitle>
              <CardDescription>{reports.length === 1 ? t("patientDetail.reportCountOne", { count: reports.length }) : t("patientDetail.reportCountMany", { count: reports.length })}</CardDescription>
            </div>
            {reports.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder={t("patientDetail.searchReports")} className="pl-9 h-9" value={reportQuery} onChange={(e) => setReportQuery(e.target.value)} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("patientDetail.noReportsYet")}</p>
          ) : reportsFiltered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("patientDetail.noReportsMatch")}</p>
          ) : (
            <div className="space-y-2">
              {reportsFiltered.map((r) => (
                <button key={r.id} onClick={() => setViewing(r)} className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/40 transition-colors">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0 truncate font-medium text-foreground">{r.diagnosis || t("patientDetail.untitledReport")}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtDate(r.created_at)}</span>
                  <Badge variant={REPORT_STATUS_VARIANT[r.status]}>{t(REPORT_STATUS_KEY[r.status])}</Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appointments */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="w-4 h-4 text-primary" />{t("patientDetail.appointmentHistory")}</CardTitle>
              <CardDescription>{appointments.length === 1 ? t("patientDetail.appointmentCountOne", { count: appointments.length }) : t("patientDetail.appointmentCountMany", { count: appointments.length })}</CardDescription>
            </div>
            {appointments.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder={t("patientDetail.searchAppointments")} className="pl-9 h-9" value={apptQuery} onChange={(e) => setApptQuery(e.target.value)} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("patientDetail.noAppointments")}</p>
          ) : apptsFiltered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("patientDetail.noApptMatch")}</p>
          ) : (
            <div className="space-y-2">
              {apptsFiltered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setViewingAppt(a)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/40 transition-colors"
                >
                  <div className="text-sm font-medium text-foreground w-24 shrink-0">{fmtDate(a.starts_at)}</div>
                  <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground">{a.reason || "—"}</span>
                  <Badge variant="outline">{t(`status.${a.status}` as TKey)}</Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing documents (read-only reference; managed on reception's Billing page) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="w-4 h-4 text-primary" />{t("patientDetail.billingDocuments")}</CardTitle>
          <CardDescription>{billing.length === 1 ? t("patientDetail.billingCountOne", { count: billing.length }) : t("patientDetail.billingCountMany", { count: billing.length })} · {t("patientDetail.managedByReception")}</CardDescription>
        </CardHeader>
        <CardContent>
          {billing.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("patientDetail.noBilling")}</p>
          ) : (
            <div className="space-y-2">
              {billing.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setViewingInvoice(b)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/40 transition-colors"
                >
                  <Receipt className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs text-primary shrink-0">{b.invoiceNumber}</span>
                  <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground">{insuranceLabel(b.insuranceType)} · {fmtDate(b.serviceDate)}</span>
                  <span className="text-sm font-medium tabular-nums shrink-0">{b.totalCents == null ? "—" : formatCents(b.totalCents)}</span>
                  <Badge variant="outline">{t(INVOICE_STATUS_KEY[b.status])}</Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents — imaging, lab results, referrals attached to the record */}
      <PatientDocuments
        patientId={patient.id}
        documents={documents}
        canUpload
        viewerRole={viewerRole}
        currentUserId={currentUserId}
      />

      {/* Report — formal printable document */}
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          {viewing && (
            <>
              <DialogHeader className="no-print">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    {t("patientDetail.medicalReport")}
                    <Badge variant={REPORT_STATUS_VARIANT[viewing.status]}>{t(REPORT_STATUS_KEY[viewing.status])}</Badge>
                  </DialogTitle>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => printReport(reportRef.current)}>
                    <Printer className="w-4 h-4" /> {t("patientDetail.printPdf")}
                  </Button>
                </div>
                <DialogDescription>{patientName(patient)} · {fmtDate(viewing.approved_at ?? viewing.created_at)}</DialogDescription>
              </DialogHeader>
              <ReportDocument
                ref={reportRef}
                doctorName={viewing.doctorName}
                doctorSpecialization={viewing.doctorSpecialization}
                doctorLanr={viewing.doctorLanr}
                patientName={patientName(patient)}
                patientDob={patient.birth_date}
                date={viewing.approved_at ?? viewing.created_at}
                diagnosis={viewing.diagnosis}
                body={viewing.formatted_report}
                rawNotes={viewing.raw_notes}
                prescriptions={viewing.prescriptions}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Appointment details */}
      <Dialog open={viewingAppt !== null} onOpenChange={(o) => !o && setViewingAppt(null)}>
        <DialogContent className="sm:max-w-md">
          {viewingAppt && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-primary" />{t("patientDetail.appointment")}</DialogTitle>
                <DialogDescription>{patientName(patient)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <DetailRow icon={<Calendar className="w-4 h-4" />} label={t("patientDetail.dateTime")} value={fmtDateTime(viewingAppt.starts_at)} />
                <DetailRow icon={<Clock className="w-4 h-4" />} label={t("patientDetail.duration")} value={`${viewingAppt.durationMin} min`} />
                <DetailRow icon={<Stethoscope className="w-4 h-4" />} label={t("patientDetail.doctor")} value={viewingAppt.doctorName} />
                <DetailRow icon={<FileText className="w-4 h-4" />} label={t("patientDetail.reason")} value={viewingAppt.reason || "—"} />
                {viewingAppt.checkInAt && (
                  <DetailRow icon={<UserCheck className="w-4 h-4" />} label={t("patientDetail.checkedIn")} value={fmtDateTime(viewingAppt.checkInAt)} />
                )}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-muted-foreground">{t("patientDetail.status")}</span>
                  <Badge variant="outline">{t(`status.${viewingAppt.status}` as TKey)}</Badge>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Billing document — formal printable invoice / Leistungsnachweis */}
      <Dialog open={viewingInvoice !== null} onOpenChange={(o) => !o && setViewingInvoice(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          {viewingInvoice && (
            <>
              <DialogHeader className="no-print">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <DialogTitle>
                    {viewingInvoice.insuranceType === "gkv" ? "Leistungsnachweis (GKV)" : t("patientDetail.invoiceTitle", { number: viewingInvoice.invoiceNumber })}
                  </DialogTitle>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => printReport(invoiceRef.current)}>
                    <Printer className="w-4 h-4" /> {t("patientDetail.printPdf")}
                  </Button>
                </div>
                <DialogDescription>{patientName(patient)} · {fmtDate(viewingInvoice.serviceDate)}</DialogDescription>
              </DialogHeader>
              <InvoiceDocument
                ref={invoiceRef}
                insuranceType={viewingInvoice.insuranceType}
                patientName={patientName(patient)}
                patientDob={patient.birth_date}
                insurerName={viewingInvoice.insurerName}
                insuranceNumber={viewingInvoice.insuranceNumber}
                invoiceNumber={viewingInvoice.invoiceNumber}
                invoiceDate={viewingInvoice.invoiceDate}
                serviceDate={viewingInvoice.serviceDate}
                dueDate={viewingInvoice.dueDate}
                items={viewingInvoice.items}
                totalCents={viewingInvoice.totalCents}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function AdminField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-foreground truncate ${mono ? "font-mono text-sm" : "text-sm font-medium"}`}>{value}</p>
    </div>
  )
}

function VitalTile({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">{icon}<span className="text-xs">{label}</span></div>
      <p className="text-lg font-semibold text-foreground">{value} {value !== "—" && <span className="text-xs font-normal text-muted-foreground">{unit}</span>}</p>
    </div>
  )
}
