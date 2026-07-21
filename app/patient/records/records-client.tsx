"use client"

/**
 * Searchable list of the patient's medical reports. Filtering is performed
 * client-side over the reports loaded by the Server Component.
 */
import { useState } from "react"
import Link from "next/link"
import { FileText, Calendar, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"
import type { TKey } from "@/lib/i18n/translate"

export interface ReportListItem {
  id: string
  diagnosis: string | null
  doctorName: string
  date: string
  status: string
}

const RECORD_STATUS_KEY: Record<string, TKey> = {
  draft: "patientRecords.statusDraft",
  pending_approval: "patientRecords.statusPendingApproval",
  approved: "patientRecords.statusApproved",
}

export function RecordsClient({ reports }: { reports: ReportListItem[] }) {
  const t = useT()
  const locale = useLocale()
  const [search, setSearch] = useState("")

  const filtered = reports
    .filter((r) => (r.diagnosis ?? "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">{t("patientRecords.title")}</h1>
          <p className="text-muted-foreground">{t("patientRecords.subtitle")}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={t("patientRecords.searchPlaceholder")} className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {t("patientRecords.medicalReports")}
            </CardTitle>
            <CardDescription>{t("patientRecords.historyDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {filtered.length > 0 ? (
              <div className="space-y-4">
                {filtered.map((report) => (
                  <div key={report.id} className="p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground line-clamp-1 break-words">
                            {report.diagnosis?.trim() || t("patientRecords.reportFallbackTitle")}
                          </h3>
                          <p className="text-sm text-muted-foreground">{report.doctorName}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-xs gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(report.date).toLocaleDateString(INTL_LOCALE[locale], { month: "short", day: "numeric", year: "numeric" })}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">{RECORD_STATUS_KEY[report.status] ? t(RECORD_STATUS_KEY[report.status]) : report.status}</Badge>
                            {Date.now() - new Date(report.date).getTime() < 7 * 86_400_000 && (
                              <Badge className="text-xs bg-primary/10 text-primary border border-primary/20">{t("patientRecords.newBadge")}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <Link href={`/patient/records/${report.id}`} className="shrink-0">
                        <Button variant="outline" size="sm" className="w-full sm:w-auto">{t("patientRecords.viewReport")}</Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">{t("patientRecords.noRecords")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
