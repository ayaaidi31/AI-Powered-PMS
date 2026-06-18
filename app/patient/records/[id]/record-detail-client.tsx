"use client"

/**
 * Report detail view. Displays the official medical report. The
 * "Simplify with AI" control is a placeholder for the on-demand simplification
 * module (REQ-SIMP-01), which is not yet wired to a model — selecting it shows
 * a notice rather than fabricating a simplified text.
 */
import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { FileText, Calendar, User, Sparkles, ArrowLeft, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { ReportDocument } from "@/components/report-document"
import { ReportContent } from "@/components/report-content"
import { printReport } from "@/lib/print-element"
import { simplifyReport } from "@/lib/actions/ai"
import type { PrescriptionItem } from "@/lib/seed-data"

interface ReportDetail {
  id: string
  diagnosis: string | null
  formatted_report: string | null
  raw_notes: string | null
  prescriptions: PrescriptionItem[]
  status: string
  date: string
  doctorName: string
  doctorSpecialization: string | null
  patientName: string
  patientDob: string | null
}

export function RecordDetailClient({ report }: { report: ReportDetail | null }) {
  const reportRef = useRef<HTMLDivElement>(null)
  const [simplified, setSimplified] = useState<string | null>(null)
  const [isSimplifying, startSimplify] = useTransition()

  function handleSimplify() {
    if (!report) return
    const text = report.formatted_report || report.raw_notes || report.diagnosis || ""
    startSimplify(async () => {
      const result = await simplifyReport(text)
      if (result.status === "ok") {
        setSimplified(result.data.summary)
      } else {
        toast.error(result.message)
      }
    })
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Report Not Found</h2>
            <p className="text-muted-foreground mb-6">We couldn&apos;t find this medical report.</p>
            <Link href="/patient/records"><Button>Back to Records</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-muted">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link href="/patient/records">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-foreground">{report.diagnosis ?? "Medical Report"}</h1>
              <p className="text-sm text-muted-foreground">
                {new Date(report.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => printReport(reportRef.current)}>
              <Download className="w-4 h-4" />
              Print / PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap gap-4 mb-6">
          <Badge variant="outline" className="gap-1"><User className="w-3 h-3" />{report.doctorName}</Badge>
          <Badge variant="outline" className="gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(report.date).toLocaleDateString()}
          </Badge>
          <Badge variant="secondary">{report.status}</Badge>
        </div>

        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">AI Report Simplification</h3>
                  <p className="text-sm text-muted-foreground">
                    Get a plain-language explanation of your report.
                  </p>
                </div>
              </div>
              <Button className="gap-2 shrink-0" onClick={handleSimplify} disabled={isSimplifying}>
                <Sparkles className="w-4 h-4" />
                {isSimplifying ? "Simplifying…" : simplified ? "Regenerate" : "Simplify with AI"}
              </Button>
            </div>

            {simplified && (
              <div className="mt-4 rounded-xl border border-primary/20 bg-background p-5 sm:p-6 shadow-sm">
                <div className="[&_h4]:text-primary [&_h4]:text-base [&_h4]:mt-5 [&_h4:first-child]:mt-0 [&_p]:text-[15px] [&_p]:text-foreground/90 leading-relaxed">
                  <ReportContent text={simplified} />
                </div>
                <p className="mt-5 pt-3 border-t border-border text-xs text-muted-foreground flex items-start gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  AI-generated plain-language summary — for understanding only, not a medical document.
                  Please rely on the official report and your doctor&apos;s advice.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <ReportDocument
          ref={reportRef}
          doctorName={report.doctorName}
          doctorSpecialization={report.doctorSpecialization}
          patientName={report.patientName}
          patientDob={report.patientDob}
          date={report.date}
          diagnosis={report.diagnosis}
          body={report.formatted_report}
          rawNotes={report.raw_notes}
          prescriptions={report.prescriptions}
        />
      </div>
    </div>
  )
}
