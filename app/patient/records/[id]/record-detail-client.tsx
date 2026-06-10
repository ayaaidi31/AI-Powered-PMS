"use client"

/**
 * Report detail view (Feature 14). Displays the official medical report. The
 * "Simplify with AI" control is a placeholder for the on-demand simplification
 * module (REQ-SIMP-01), which is not yet wired to a model — selecting it shows
 * a notice rather than fabricating a simplified text.
 */
import Link from "next/link"
import { FileText, Calendar, User, Sparkles, ArrowLeft, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { ReportContent } from "@/components/report-content"

interface ReportDetail {
  id: string
  diagnosis: string | null
  formatted_report: string | null
  raw_notes: string | null
  status: string
  date: string
  doctorName: string
}

export function RecordDetailClient({ report }: { report: ReportDetail | null }) {
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

  const officialText = report.formatted_report ?? report.raw_notes

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
            <Button variant="outline" size="sm" className="gap-2" onClick={() => toast.info("PDF export is not yet available.")}>
              <Download className="w-4 h-4" />
              Download PDF
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
                <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">AI Report Simplification</h3>
                  <p className="text-sm text-muted-foreground">
                    Plain-language summaries (Feature 14) are coming soon.
                  </p>
                </div>
              </div>
              <Button
                className="gap-2"
                onClick={() => toast.info("AI simplification is not yet connected.")}
              >
                <Sparkles className="w-4 h-4" />
                Simplify with AI
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Official Medical Report</CardTitle>
            <CardDescription>The complete medical report as documented by your healthcare provider</CardDescription>
          </CardHeader>
          <CardContent>
            {officialText ? (
              <ReportContent text={officialText} />
            ) : (
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Diagnosis</h4>
                  <p className="text-muted-foreground">{report.diagnosis ?? "—"}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
