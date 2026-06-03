"use client"

import Link from "next/link"
import { FileText, Calendar, Search, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { mockMedicalReports, currentUser } from "@/lib/mock-data"

export default function PatientRecordsPage() {
  const patient = currentUser.patient
  
  const reports = mockMedicalReports
    .filter(report => report.patientId === patient.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Health Records</h1>
          <p className="text-muted-foreground">View your medical reports and visit history</p>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search records..."
              className="pl-10"
            />
          </div>
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
        </div>

        {/* Records List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Medical Reports
            </CardTitle>
            <CardDescription>
              Your complete medical history
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reports.length > 0 ? (
              <div className="space-y-4">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className="p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground">
                            {report.diagnosis}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {report.doctorName}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-xs gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(report.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {report.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Link href={`/patient/records/${report.id}`}>
                        <Button variant="outline" size="sm">
                          View Report
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No health records found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
