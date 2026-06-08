"use client"

/**
 * Doctor's reports list (read-only). Reports are searchable by patient or
 * diagnosis and filterable by status. Selecting one opens its full content.
 * Approved reports are immutable (BR-02-06), so this view does not edit them.
 */
import { useState } from "react"
import { FileText, Search, Calendar, User, Pill } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { ReportListRow } from "@/lib/queries"
import type { MedicalReportRow } from "@/lib/seed-data"

const STATUS: Record<MedicalReportRow["status"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  pending_approval: { label: "Pending Approval", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE")

export function DoctorReportsClient({ reports }: { reports: ReportListRow[] }) {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [viewing, setViewing] = useState<ReportListRow | null>(null)

  const filtered = reports.filter((r) => {
    const haystack = `${r.patient_name} ${r.diagnosis ?? ""}`.toLowerCase()
    const matchesSearch = haystack.includes(query.toLowerCase())
    const matchesStatus = statusFilter === "all" || r.status === statusFilter
    return matchesSearch && matchesStatus
  })

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
              <Input
                placeholder="Search by patient or diagnosis…"
                className="pl-10"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
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
                <button
                  key={r.id}
                  onClick={() => setViewing(r)}
                  className="w-full text-left flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-border hover:bg-accent/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground truncate">{r.diagnosis || "Untitled report"}</span>
                      <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{r.patient_name}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{fmtDate(r.starts_at)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Read-only report detail */}
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {viewing.diagnosis || "Report"}
                  <Badge variant={STATUS[viewing.status].variant}>{STATUS[viewing.status].label}</Badge>
                </DialogTitle>
                <DialogDescription>{viewing.patient_name} · {fmtDate(viewing.starts_at)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {viewing.diagnosis && (
                  <Section title="Diagnosis"><p>{viewing.diagnosis}</p></Section>
                )}
                {viewing.formatted_report && (
                  <Section title="Report"><p className="whitespace-pre-wrap leading-relaxed">{viewing.formatted_report}</p></Section>
                )}
                {viewing.raw_notes && (
                  <Section title="Consultation Notes"><p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{viewing.raw_notes}</p></Section>
                )}
                {viewing.prescriptions && viewing.prescriptions.length > 0 && (
                  <Section title="Prescriptions">
                    <div className="space-y-1.5">
                      {viewing.prescriptions.map((rx, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Pill className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium">{rx.medication}</span>
                          <span className="text-muted-foreground">{rx.dosage} · {rx.frequency}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
      {children}
    </div>
  )
}
