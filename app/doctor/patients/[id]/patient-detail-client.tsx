"use client"

/**
 * Doctor's read-only view of a single patient: profile, clinical summary,
 * reports (openable) and appointment history. Editing of reports is done from
 * the Reports page / workspace; this view is for review and navigation.
 */
import { useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, User, Mail, Phone, MapPin, Shield, AlertCircle, Activity, Heart,
  Thermometer, Pill, FileText, Calendar, ClipboardList, Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { PatientRow, VitalsRow, PrescriptionItem, MedicalReportRow } from "@/lib/seed-data"
import { patientName, initials, insuranceLabel, insuranceVariant, statusLabel, type AppointmentStatusDb } from "@/lib/display"
import { ReportContent } from "@/components/report-content"

interface ReportItem {
  id: string
  diagnosis: string | null
  formatted_report: string | null
  raw_notes: string | null
  prescriptions: PrescriptionItem[]
  status: MedicalReportRow["status"]
  created_at: string
}
interface AppointmentItem {
  id: string
  starts_at: string
  status: string
  reason: string | null
}
interface Clinical {
  allergies: string[]
  conditions: string[]
  medications: { name: string; dosage: string; frequency: string }[]
  vitals: VitalsRow | null
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
  patient, clinical, reports, appointments,
}: { patient: PatientRow; clinical: Clinical; reports: ReportItem[]; appointments: AppointmentItem[] }) {
  const [viewing, setViewing] = useState<ReportItem | null>(null)
  const [reportQuery, setReportQuery] = useState("")
  const [apptQuery, setApptQuery] = useState("")
  const v = clinical.vitals

  const reportsFiltered = reports.filter((r) =>
    `${r.diagnosis ?? ""} ${REPORT_STATUS[r.status].label} ${fmtDate(r.created_at)}`.toLowerCase().includes(reportQuery.toLowerCase()),
  )
  const apptsFiltered = appointments.filter((a) =>
    `${a.reason ?? ""} ${a.status} ${fmtDate(a.starts_at)}`.toLowerCase().includes(apptQuery.toLowerCase()),
  )

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
      <Link href="/doctor/patients" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
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
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <div className="text-sm font-medium text-foreground w-24 shrink-0">{fmtDate(a.starts_at)}</div>
                  <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground">{a.reason || "—"}</span>
                  <Badge variant="outline">{statusLabel(a.status as AppointmentStatusDb)}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report view (read-only) */}
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {viewing.diagnosis || "Report"}
                  <Badge variant={REPORT_STATUS[viewing.status].variant}>{REPORT_STATUS[viewing.status].label}</Badge>
                </DialogTitle>
                <DialogDescription>{fmtDate(viewing.created_at)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {viewing.formatted_report && <ReportContent text={viewing.formatted_report} />}
                {!viewing.formatted_report && viewing.raw_notes && (
                  <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{viewing.raw_notes}</p>
                )}
                {viewing.prescriptions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Prescriptions</p>
                    <div className="space-y-1.5">
                      {viewing.prescriptions.map((rx, i) => (
                        <div key={i} className="flex items-center gap-2"><Pill className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="font-medium">{rx.medication}</span><span className="text-muted-foreground">{rx.dosage} · {rx.frequency}</span></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
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
