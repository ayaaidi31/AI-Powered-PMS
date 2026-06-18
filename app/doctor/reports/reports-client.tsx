"use client"

/**
 * Doctor's reports list. Reports are searchable by patient or diagnosis and
 * filterable by status. Draft and pending reports can be edited and approved
 * here; approved reports are immutable (BR-02-06) and shown read-only.
 */
import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FileText, Search, Calendar, User, CheckCircle2, Save, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import type { ReportListRow } from "@/lib/queries"
import type { MedicalReportRow } from "@/lib/seed-data"
import { ReportDocument } from "@/components/report-document"
import { printReport } from "@/lib/print-element"
import { updateReport, approveReport } from "@/lib/actions/reports"

const STATUS: Record<MedicalReportRow["status"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  pending_approval: { label: "Pending Approval", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE")

export function DoctorReportsClient({
  reports, doctor,
}: { reports: ReportListRow[]; doctor: { name: string; specialization: string | null; lanr: string | null } }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const [viewing, setViewing] = useState<ReportListRow | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const [diagnosis, setDiagnosis] = useState("")
  const [report, setReport] = useState("")
  const [notes, setNotes] = useState("")

  const editable = viewing != null && viewing.status !== "approved"

  function open(r: ReportListRow) {
    setViewing(r)
    setDiagnosis(r.diagnosis ?? "")
    setReport(r.formatted_report ?? "")
    setNotes(r.raw_notes ?? "")
  }

  const filtered = reports.filter((r) => {
    const haystack = `${r.patient_name} ${r.diagnosis ?? ""}`.toLowerCase()
    const matchesSearch = haystack.includes(query.toLowerCase())
    const matchesStatus = statusFilter === "all" || r.status === statusFilter
    return matchesSearch && matchesStatus
  })

  function handleSave() {
    if (!viewing) return
    startTransition(async () => {
      const res = await updateReport(viewing.id, {
        diagnosis: diagnosis.trim() || undefined,
        formatted_report: report.trim() || undefined,
        raw_notes: notes.trim() || undefined,
      })
      if (res.status === "ok") {
        toast.success("Report saved.")
        router.refresh()
      } else {
        toast.error(res.message)
      }
    })
  }

  function handleApprove() {
    if (!viewing) return
    if (!diagnosis.trim()) { toast.error("A diagnosis is required to approve the report."); return }
    startTransition(async () => {
      // Persist any edits, then finalise (REQ-DOC-04).
      await updateReport(viewing.id, {
        diagnosis: diagnosis.trim(),
        formatted_report: report.trim() || undefined,
        raw_notes: notes.trim() || undefined,
      })
      const res = await approveReport(viewing.id)
      if (res.status === "ok") {
        toast.success("Report approved.")
        router.refresh()
        setViewing(null)
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" /> Reports
        </h1>
        <p className="text-muted-foreground">Consultation reports you have authored</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by patient or diagnosis…" className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>{filtered.length} report{filtered.length !== 1 ? "s" : ""}</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No reports found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-border hover:bg-accent/40 transition-colors">
                  <button onClick={() => open(r)} className="flex-1 min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground truncate">{r.diagnosis || "Untitled report"}</span>
                      <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{fmtDate(r.starts_at)}</span>
                    </div>
                  </button>
                  <Link
                    href={`/doctor/patients/${r.patient_id}`}
                    className="flex items-center gap-1 text-sm text-primary hover:underline shrink-0"
                  >
                    <User className="w-3.5 h-3.5" />{r.patient_name}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report detail — editable for draft/pending, formal document when approved */}
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className={`${editable ? "sm:max-w-2xl" : "sm:max-w-4xl"} max-h-[90vh] overflow-y-auto overflow-x-hidden`}>
          {viewing && (
            <>
              <DialogHeader className="no-print">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    {editable ? "Edit Report" : "Medical Report"}
                    <Badge variant={STATUS[viewing.status].variant}>{STATUS[viewing.status].label}</Badge>
                  </DialogTitle>
                  {!editable && (
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => printReport(reportRef.current)}>
                      <Printer className="w-4 h-4" /> Print / PDF
                    </Button>
                  )}
                </div>
                <DialogDescription>{viewing.patient_name} · {fmtDate(viewing.starts_at)}</DialogDescription>
              </DialogHeader>

              {editable ? (
                <div className="space-y-4">
                  <div>
                    <Label>Diagnosis</Label>
                    <Textarea className="mt-1.5 min-h-[60px]" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
                  </div>
                  <div>
                    <Label>Report</Label>
                    <Textarea className="mt-1.5 min-h-[180px] text-sm" value={report} onChange={(e) => setReport(e.target.value)} placeholder="Formal report (supports **bold** headings and - bullet lists)…" />
                  </div>
                  <div>
                    <Label>Consultation Notes</Label>
                    <Textarea className="mt-1.5 min-h-[100px] text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </div>
              ) : (
                <ReportDocument
                  ref={reportRef}
                  doctorName={doctor.name}
                  doctorSpecialization={doctor.specialization}
                  doctorLanr={doctor.lanr}
                  patientName={viewing.patient_name}
                  patientDob={viewing.patient_dob}
                  date={viewing.approved_at ?? viewing.created_at}
                  diagnosis={viewing.diagnosis}
                  body={viewing.formatted_report}
                  rawNotes={viewing.raw_notes}
                  prescriptions={viewing.prescriptions ?? []}
                />
              )}

              {editable && (
                <DialogFooter>
                  <Button variant="outline" className="gap-2" onClick={handleSave} disabled={isPending}>
                    <Save className="w-4 h-4" /> Save Draft
                  </Button>
                  <Button className="gap-2" onClick={handleApprove} disabled={isPending}>
                    <CheckCircle2 className="w-4 h-4" /> {isPending ? "Saving…" : "Approve Report"}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
