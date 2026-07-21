"use client"

/**
 * Doctor's reports list. Reports are searchable by patient or diagnosis and
 * filterable by status. Draft and pending reports can be edited and approved
 * here; approved reports are immutable (BR-02-06) and shown read-only.
 */
import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FileText, Search, Calendar, User, CheckCircle2, Save, Printer, Trash2, ClipboardList } from "lucide-react"
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
import { updateReport, approveReport, deleteReport } from "@/lib/actions/reports"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"
import type { TKey } from "@/lib/i18n/translate"

const STATUS_VARIANT: Record<MedicalReportRow["status"], "default" | "secondary" | "outline"> = {
  draft: "outline",
  pending_approval: "secondary",
  approved: "default",
}
const STATUS_LABEL_KEY: Record<MedicalReportRow["status"], TKey> = {
  draft: "reports.statusDraft",
  pending_approval: "reports.statusPendingApproval",
  approved: "reports.statusApproved",
}

export function DoctorReportsClient({
  reports, doctor,
}: { reports: ReportListRow[]; doctor: { name: string; specialization: string | null; lanr: string | null } }) {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(INTL_LOCALE[locale])
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const [viewing, setViewing] = useState<ReportListRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ReportListRow | null>(null)
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
        toast.success(t("reports.reportSaved"))
        router.refresh()
      } else {
        toast.error(res.message)
      }
    })
  }

  function confirmDelete(reason: string) {
    if (!deleteTarget) return
    const target = deleteTarget
    startTransition(async () => {
      const r = await deleteReport(target.id, reason)
      if (r.status === "ok") {
        toast.success(r.data.action === "retracted" ? t("reports.reportRetracted") : t("reports.reportDeleted"))
        setDeleteTarget(null)
        router.refresh()
      } else {
        toast.error(r.message)
      }
    })
  }

  function handleApprove() {
    if (!viewing) return
    if (!diagnosis.trim()) { toast.error(t("reports.diagnosisRequired")); return }
    startTransition(async () => {
      // Persist any edits, then finalise (REQ-DOC-04).
      await updateReport(viewing.id, {
        diagnosis: diagnosis.trim(),
        formatted_report: report.trim() || undefined,
        raw_notes: notes.trim() || undefined,
      })
      const res = await approveReport(viewing.id)
      if (res.status === "ok") {
        toast.success(t("reports.reportApproved"))
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
          <FileText className="w-6 h-6 text-primary" /> {t("reports.title")}
        </h1>
        <p className="text-muted-foreground">{t("reports.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder={t("reports.searchPlaceholder")} className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder={t("reports.statusPlaceholder")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("reports.allStatuses")}</SelectItem>
                <SelectItem value="draft">{t("reports.statusDraft")}</SelectItem>
                <SelectItem value="pending_approval">{t("reports.statusPendingApproval")}</SelectItem>
                <SelectItem value="approved">{t("reports.statusApproved")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("reports.title")}</CardTitle>
          <CardDescription>{filtered.length === 1 ? t("reports.reportCountOne", { count: filtered.length }) : t("reports.reportCountMany", { count: filtered.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>{t("reports.noReports")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((r) => (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-border hover:bg-accent/40 transition-colors">
                  <button onClick={() => open(r)} className="flex-1 min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground truncate">{r.diagnosis || t("reports.untitledReport")}</span>
                      <Badge variant={STATUS_VARIANT[r.status]}>{t(STATUS_LABEL_KEY[r.status])}</Badge>
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
                  <Link
                    href={`/doctor/reports/${r.id}`}
                    className="shrink-0 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    title={t("reports.openRecordHint")}
                  >
                    <ClipboardList className="w-3.5 h-3.5" /> {t("reports.record")}
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(r)}
                    title={r.status === "approved" ? t("reports.retractReport") : t("reports.deleteReport")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
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
                    {editable ? t("reports.editReport") : t("reports.medicalReport")}
                    <Badge variant={STATUS_VARIANT[viewing.status]}>{t(STATUS_LABEL_KEY[viewing.status])}</Badge>
                  </DialogTitle>
                  {!editable && (
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => printReport(reportRef.current)}>
                      <Printer className="w-4 h-4" /> {t("reports.printPdf")}
                    </Button>
                  )}
                </div>
                <DialogDescription>{viewing.patient_name} · {fmtDate(viewing.starts_at)}</DialogDescription>
              </DialogHeader>

              {editable ? (
                <div className="space-y-4">
                  <div>
                    <Label>{t("reports.diagnosis")}</Label>
                    <Textarea className="mt-1.5 min-h-[60px]" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
                  </div>
                  <div>
                    <Label>{t("reports.reportLabel")}</Label>
                    <Textarea className="mt-1.5 min-h-[180px] text-sm" value={report} onChange={(e) => setReport(e.target.value)} placeholder={t("reports.reportPlaceholder")} />
                  </div>
                  <div>
                    <Label>{t("reports.consultationNotes")}</Label>
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
                    <Save className="w-4 h-4" /> {t("reports.saveDraft")}
                  </Button>
                  <Button className="gap-2" onClick={handleApprove} disabled={isPending}>
                    <CheckCircle2 className="w-4 h-4" /> {isPending ? t("reports.saving") : t("reports.approveReport")}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {deleteTarget && (
        <ConfirmDeleteDialog
          open
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title={deleteTarget.status === "approved" ? t("reports.retractReport") : t("reports.deleteReport")}
          description={`${deleteTarget.patient_name} · ${fmtDate(deleteTarget.starts_at)}`}
          consequence={
            deleteTarget.status === "approved"
              ? t("reports.retainConsequence")
              : t("reports.deleteConsequence")
          }
          confirmPhrase={deleteTarget.status === "approved" ? "RETRACT" : "DELETE"}
          confirmLabel={deleteTarget.status === "approved" ? t("reports.retractReport") : t("reports.deletePermanently")}
          destructive={deleteTarget.status !== "approved"}
          pending={isPending}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
