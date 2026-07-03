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
  Stethoscope, ChevronRight, UserCheck, Receipt,
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
import { patientName, initials, insuranceLabel, insuranceVariant, formatCents, statusLabel, type AppointmentStatusDb } from "@/lib/display"
import { ReportDocument } from "@/components/report-document"
import { InvoiceDocument } from "@/components/invoice-document"
import { PatientDocuments } from "@/components/patient-documents"
import { printReport } from "@/lib/print-element"

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

const INVOICE_STATUS: Record<InvoiceRow["status"], string> = {
  ready_for_kv: "Queued for KV",
  pending_payment: "Pending Payment",
  sent: "Sent",
  paid: "Paid",
  storno: "Voided",
}

const REPORT_STATUS: Record<MedicalReportRow["status"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  pending_approval: { label: "Pending Approval", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
}

function age(birthDate: string) {
  const b = new Date(birthDate)
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--
  return a
}
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE")

export function PatientDetailClient({
  patient, clinical, reports, appointments, billing, documents,
  backHref = "/doctor/patients", viewerRole = "doctor", currentUserId = null,
}: PatientDetailData & {
  backHref?: string
  viewerRole?: "doctor" | "receptionist"
  currentUserId?: string | null
}) {
  const [viewing, setViewing] = useState<ReportItem | null>(null)
  const [viewingAppt, setViewingAppt] = useState<AppointmentItem | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<BillingDoc | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const invoiceRef = useRef<HTMLDivElement>(null)
  const [reportQuery, setReportQuery] = useState("")
  const [apptQuery, setApptQuery] = useState("")
  const v = clinical.vitals

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString("de-DE", { dateStyle: "long", timeStyle: "short" })

  const reportsFiltered = reports.filter((r) =>
    `${r.diagnosis ?? ""} ${REPORT_STATUS[r.status].label} ${fmtDate(r.created_at)}`.toLowerCase().includes(reportQuery.toLowerCase()),
  )
  const apptsFiltered = appointments.filter((a) =>
    `${a.reason ?? ""} ${a.status} ${fmtDate(a.starts_at)}`.toLowerCase().includes(apptQuery.toLowerCase()),
  )

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to patients
      </Link>

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
                <span>{age(patient.birth_date)} years old</span>
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
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Clinical summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4 text-primary" />Clinical Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Chronic Conditions</p>
              {clinical.conditions.length ? (
                <div className="flex flex-wrap gap-1.5">{clinical.conditions.map((c, i) => <Badge key={i} variant="secondary">{c}</Badge>)}</div>
              ) : <p className="text-muted-foreground">None recorded</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Current Medications</p>
              {clinical.medications.length ? (
                <div className="space-y-1">
                  {clinical.medications.map((m, i) => (
                    <div key={i} className="flex items-center gap-2"><Pill className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="font-medium">{m.name}</span><span className="text-muted-foreground">{m.dosage} · {m.frequency}</span></div>
                  ))}
                </div>
              ) : <p className="text-muted-foreground">None recorded</p>}
            </div>
          </CardContent>
        </Card>

        {/* Latest vitals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-primary" />Latest Vitals</CardTitle>
            {v && <CardDescription>Recorded {fmtDate(v.recorded_at)}</CardDescription>}
          </CardHeader>
          <CardContent>
            {v ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <VitalTile icon={<Activity className="w-3.5 h-3.5" />} label="Blood Pressure" value={v.systolic != null ? `${v.systolic}/${v.diastolic}` : "—"} unit="mmHg" />
                <VitalTile icon={<Heart className="w-3.5 h-3.5" />} label="Heart Rate" value={v.heart_rate != null ? `${v.heart_rate}` : "—"} unit="bpm" />
                <VitalTile icon={<Thermometer className="w-3.5 h-3.5" />} label="Temperature" value={v.temperature_c != null ? `${v.temperature_c}` : "—"} unit="°C" />
                <VitalTile icon={<User className="w-3.5 h-3.5" />} label="Weight" value={v.weight_kg != null ? `${v.weight_kg}` : "—"} unit="kg" />
              </div>
            ) : <p className="text-sm text-muted-foreground">No vitals recorded yet.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Reports */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />Reports</CardTitle>
              <CardDescription>{reports.length} report{reports.length !== 1 ? "s" : ""}</CardDescription>
            </div>
            {reports.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search reports…" className="pl-9 h-9" value={reportQuery} onChange={(e) => setReportQuery(e.target.value)} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports yet.</p>
          ) : reportsFiltered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports match your search.</p>
          ) : (
            <div className="space-y-2">
              {reportsFiltered.map((r) => (
                <button key={r.id} onClick={() => setViewing(r)} className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/40 transition-colors">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0 truncate font-medium text-foreground">{r.diagnosis || "Untitled report"}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtDate(r.created_at)}</span>
                  <Badge variant={REPORT_STATUS[r.status].variant}>{REPORT_STATUS[r.status].label}</Badge>
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
              <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="w-4 h-4 text-primary" />Appointment History</CardTitle>
              <CardDescription>{appointments.length} appointment{appointments.length !== 1 ? "s" : ""}</CardDescription>
            </div>
            {appointments.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search appointments…" className="pl-9 h-9" value={apptQuery} onChange={(e) => setApptQuery(e.target.value)} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments.</p>
          ) : apptsFiltered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments match your search.</p>
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
                  <Badge variant="outline">{statusLabel(a.status as AppointmentStatusDb)}</Badge>
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
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="w-4 h-4 text-primary" />Billing Documents</CardTitle>
          <CardDescription>{billing.length} document{billing.length !== 1 ? "s" : ""} · managed by reception</CardDescription>
        </CardHeader>
        <CardContent>
          {billing.length === 0 ? (
            <p className="text-sm text-muted-foreground">No billing documents yet.</p>
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
                  <Badge variant="outline">{INVOICE_STATUS[b.status]}</Badge>
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
                    Medical Report
                    <Badge variant={REPORT_STATUS[viewing.status].variant}>{REPORT_STATUS[viewing.status].label}</Badge>
                  </DialogTitle>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => printReport(reportRef.current)}>
                    <Printer className="w-4 h-4" /> Print / PDF
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
                <DialogTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-primary" />Appointment</DialogTitle>
                <DialogDescription>{patientName(patient)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <DetailRow icon={<Calendar className="w-4 h-4" />} label="Date & time" value={fmtDateTime(viewingAppt.starts_at)} />
                <DetailRow icon={<Clock className="w-4 h-4" />} label="Duration" value={`${viewingAppt.durationMin} min`} />
                <DetailRow icon={<Stethoscope className="w-4 h-4" />} label="Doctor" value={viewingAppt.doctorName} />
                <DetailRow icon={<FileText className="w-4 h-4" />} label="Reason" value={viewingAppt.reason || "—"} />
                {viewingAppt.checkInAt && (
                  <DetailRow icon={<UserCheck className="w-4 h-4" />} label="Checked in" value={fmtDateTime(viewingAppt.checkInAt)} />
                )}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline">{statusLabel(viewingAppt.status as AppointmentStatusDb)}</Badge>
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
                    {viewingInvoice.insuranceType === "gkv" ? "Leistungsnachweis (GKV)" : `Invoice ${viewingInvoice.invoiceNumber}`}
                  </DialogTitle>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => printReport(invoiceRef.current)}>
                    <Printer className="w-4 h-4" /> Print / PDF
                  </Button>
                </div>
                <DialogDescription>{patientName(patient)} · {fmtDate(viewingInvoice.serviceDate)}</DialogDescription>
              </DialogHeader>
              <InvoiceDocument
                ref={invoiceRef}
                insuranceType={viewingInvoice.insuranceType}
                patientName={patientName(patient)}
                patientDob={patient.birth_date}
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

function VitalTile({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">{icon}<span className="text-xs">{label}</span></div>
      <p className="text-lg font-semibold text-foreground">{value} {value !== "—" && <span className="text-xs font-normal text-muted-foreground">{unit}</span>}</p>
    </div>
  )
}
