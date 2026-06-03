"use client"

import { useState, use } from "react"
import Link from "next/link"
import { FileText, Calendar, User, Sparkles, ArrowLeft, Download, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { mockMedicalReports } from "@/lib/mock-data"

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [isSimplifying, setIsSimplifying] = useState(false)
  const [showSimplified, setShowSimplified] = useState(false)

  const report = mockMedicalReports.find(r => r.id === id)

  if (!report) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Report Not Found</h2>
            <p className="text-muted-foreground mb-6">
              We couldn&apos;t find this medical report.
            </p>
            <Link href="/patient/records">
              <Button>Back to Records</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleSimplify = async () => {
    setIsSimplifying(true)
    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 2000))
    setShowSimplified(true)
    setIsSimplifying(false)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-muted">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link href="/patient/records">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-foreground">{report.diagnosis}</h1>
              <p className="text-sm text-muted-foreground">
                {new Date(report.date).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Report Info */}
        <div className="flex flex-wrap gap-4 mb-6">
          <Badge variant="outline" className="gap-1">
            <User className="w-3 h-3" />
            {report.doctorName}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(report.date).toLocaleDateString()}
          </Badge>
          <Badge variant="secondary">{report.status}</Badge>
        </div>

        {/* AI Simplification Button */}
        {!showSimplified && (
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
                      Get an easy-to-understand summary of your medical report
                    </p>
                  </div>
                </div>
                <Button onClick={handleSimplify} disabled={isSimplifying} className="gap-2">
                  {isSimplifying ? (
                    "Processing..."
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Simplify with AI
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Report Content Tabs */}
        <Tabs defaultValue={showSimplified ? "simplified" : "official"} className="space-y-6">
          <TabsList>
            {showSimplified && (
              <TabsTrigger value="simplified" className="gap-2">
                <Sparkles className="w-4 h-4" />
                Simplified
              </TabsTrigger>
            )}
            <TabsTrigger value="official">Official Report</TabsTrigger>
          </TabsList>

          {/* Simplified Version */}
          {showSimplified && (
            <TabsContent value="simplified">
              <Card className="border-primary/20">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <CardTitle>AI-Simplified Summary</CardTitle>
                  </div>
                  <CardDescription>
                    This is a simplified version of your medical report for easier understanding
                  </CardDescription>
                </CardHeader>
                <CardContent className="prose prose-sm max-w-none">
                  {report.simplifiedReport ? (
                    <div className="whitespace-pre-wrap text-foreground">
                      {report.simplifiedReport}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 bg-muted rounded-lg">
                        <h4 className="font-semibold text-foreground mb-2">Your Health Summary</h4>
                        <p className="text-muted-foreground">
                          {report.diagnosis}
                        </p>
                      </div>
                      
                      {report.symptoms && report.symptoms.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">What You Experienced</h4>
                          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            {report.symptoms.map((symptom, i) => (
                              <li key={i}>{symptom}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {report.treatment && (
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">What to Do</h4>
                          <p className="text-muted-foreground">{report.treatment}</p>
                        </div>
                      )}

                      {report.prescription && report.prescription.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Your Medications</h4>
                          <div className="space-y-2">
                            {report.prescription.map((med, i) => (
                              <div key={i} className="p-3 bg-muted rounded-lg">
                                <p className="font-medium text-foreground">{med.medication}</p>
                                <p className="text-sm text-muted-foreground">
                                  {med.dosage} - {med.frequency} for {med.duration}
                                </p>
                                {med.instructions && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Note: {med.instructions}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <Separator className="my-6" />

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MessageCircle className="w-4 h-4" />
                    <span>Have questions? Ask our FAQ chatbot or contact your doctor.</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Official Report */}
          <TabsContent value="official">
            <Card>
              <CardHeader>
                <CardTitle>Official Medical Report</CardTitle>
                <CardDescription>
                  The complete medical report as documented by your healthcare provider
                </CardDescription>
              </CardHeader>
              <CardContent>
                {report.formattedReport ? (
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground">
                    {report.formattedReport}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold text-foreground mb-2">Diagnosis</h4>
                      <p className="text-muted-foreground">{report.diagnosis}</p>
                    </div>

                    {report.symptoms && report.symptoms.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-foreground mb-2">Symptoms</h4>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                          {report.symptoms.map((symptom, i) => (
                            <li key={i}>{symptom}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {report.treatment && (
                      <div>
                        <h4 className="font-semibold text-foreground mb-2">Treatment Plan</h4>
                        <p className="text-muted-foreground">{report.treatment}</p>
                      </div>
                    )}

                    {report.prescription && report.prescription.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-foreground mb-2">Prescriptions</h4>
                        <div className="border border-border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted">
                              <tr>
                                <th className="text-left p-3 font-medium">Medication</th>
                                <th className="text-left p-3 font-medium">Dosage</th>
                                <th className="text-left p-3 font-medium">Frequency</th>
                                <th className="text-left p-3 font-medium">Duration</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.prescription.map((med, i) => (
                                <tr key={i} className="border-t border-border">
                                  <td className="p-3">{med.medication}</td>
                                  <td className="p-3">{med.dosage}</td>
                                  <td className="p-3">{med.frequency}</td>
                                  <td className="p-3">{med.duration}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {report.rawNotes && (
                      <div>
                        <h4 className="font-semibold text-foreground mb-2">Clinical Notes</h4>
                        <p className="text-muted-foreground whitespace-pre-wrap">{report.rawNotes}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
