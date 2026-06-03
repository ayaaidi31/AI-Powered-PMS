"use client"

import { useState } from "react"
import Link from "next/link"
import { 
  Clock, FileText, ArrowRight, AlertCircle, 
  CheckCircle2, Play, Pause, UserCheck, ChevronLeft, ChevronRight,
  Stethoscope, Save, Send, Pill, ClipboardList, Plus,
  Mic, MicOff, Sparkles, MessageSquare, History, User,
  Heart, Thermometer, Activity, FileCheck
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { mockAppointments, mockPatients, currentUser, getTodayAppointments, mockMedicalReports } from "@/lib/mock-data"

export default function DoctorWorkspace() {
  const doctor = currentUser.doctor
  
  // Get today's appointments for this doctor (waiting and scheduled only)
  const queue = getTodayAppointments()
    .filter(apt => apt.doctorId === doctor.id && (apt.status === "waiting" || apt.status === "scheduled"))
    .sort((a, b) => {
      // Waiting patients first, then by time
      if (a.status === "waiting" && b.status !== "waiting") return -1
      if (a.status !== "waiting" && b.status === "waiting") return 1
      return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
    })

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [notes, setNotes] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [treatment, setTreatment] = useState("")
  const [prescriptions, setPrescriptions] = useState<Array<{medication: string, dosage: string, frequency: string}>>([])
  const [aiSuggestionOpen, setAiSuggestionOpen] = useState(false)

  const currentAppointment = queue[currentIndex]
  const currentPatient = currentAppointment 
    ? mockPatients.find(p => p.id === currentAppointment.patientId)
    : null

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const calculateAge = (birthDate: Date) => {
    const today = new Date()
    const birth = new Date(birthDate)
    let age = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age
  }

  const handleNextPatient = () => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setNotes("")
      setDiagnosis("")
      setTreatment("")
      setPrescriptions([])
    }
  }

  const handlePreviousPatient = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const addPrescription = () => {
    setPrescriptions([...prescriptions, { medication: "", dosage: "", frequency: "" }])
  }

  const patientReports = currentPatient 
    ? mockMedicalReports.filter(r => r.patientId === currentPatient.id)
    : []

  if (!currentAppointment || !currentPatient) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto text-center py-20">
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-muted flex items-center justify-center">
            <Stethoscope className="w-12 h-12 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">No Patients in Queue</h1>
          <p className="text-muted-foreground mb-6">
            There are no waiting or scheduled patients at the moment. Check back later or view your full schedule.
          </p>
          <Link href="/doctor/schedule">
            <Button className="gap-2">
              View Schedule <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row">
      {/* Patient Queue Sidebar */}
      <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-border bg-card flex-shrink-0">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Patient Queue
          </h2>
          <p className="text-sm text-muted-foreground">{queue.length} patients remaining</p>
        </div>
        <ScrollArea className="h-48 lg:h-[calc(100vh-12rem)]">
          <div className="p-2 space-y-2">
            {queue.map((apt, index) => {
              const patient = mockPatients.find(p => p.id === apt.patientId)
              const isActive = index === currentIndex
              const hasAllergies = patient?.medicalHistory?.allergies && patient.medicalHistory.allergies.length > 0
              
              return (
                <button
                  key={apt.id}
                  onClick={() => setCurrentIndex(index)}
                  className={`w-full p-3 rounded-xl text-left transition-all duration-200 ${
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-lg" 
                      : "hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className={`w-10 h-10 ${isActive ? "border-2 border-primary-foreground/30" : ""}`}>
                      <AvatarFallback className={isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted"}>
                        {apt.patientName.split(" ").map(n => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${isActive ? "text-primary-foreground" : "text-foreground"}`}>
                        {apt.patientName}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {formatTime(apt.dateTime)}
                        </span>
                        {apt.status === "waiting" && (
                          <Badge variant="secondary" className={`text-xs h-5 ${isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-amber-100 text-amber-700"}`}>
                            Waiting
                          </Badge>
                        )}
                        {hasAllergies && !isActive && (
                          <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Patient Header */}
        <div className="p-4 sm:p-6 border-b border-border bg-card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16 border-4 border-background shadow-xl">
                <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                  {currentPatient.name.split(" ").map(n => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-foreground">{currentPatient.name}</h1>
                  <Badge variant="outline" className="text-xs">
                    {currentAppointment.status === "waiting" ? "Waiting" : "Scheduled"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <span>{calculateAge(currentPatient.dateOfBirth)} years old</span>
                  <span>•</span>
                  <span className="capitalize">{currentPatient.insuranceType}</span>
                  <span>•</span>
                  <span>{currentAppointment.reason}</span>
                </div>
                {currentPatient.medicalHistory?.allergies && currentPatient.medicalHistory.allergies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {currentPatient.medicalHistory.allergies.map((allergy, i) => (
                      <Badge key={i} variant="destructive" className="text-xs">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        {allergy}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePreviousPatient}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                {currentIndex + 1} / {queue.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleNextPatient}
                disabled={currentIndex === queue.length - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Workspace Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="grid lg:grid-cols-3 gap-6 h-full">
            {/* Left - Patient Info & History */}
            <div className="lg:col-span-1 space-y-4">
              {/* Vitals */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Vitals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Heart className="w-3.5 h-3.5" />
                        <span className="text-xs">Heart Rate</span>
                      </div>
                      <p className="text-lg font-semibold">72 bpm</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Activity className="w-3.5 h-3.5" />
                        <span className="text-xs">Blood Pressure</span>
                      </div>
                      <p className="text-lg font-semibold">120/80</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Thermometer className="w-3.5 h-3.5" />
                        <span className="text-xs">Temperature</span>
                      </div>
                      <p className="text-lg font-semibold">36.5°C</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <User className="w-3.5 h-3.5" />
                        <span className="text-xs">Weight</span>
                      </div>
                      <p className="text-lg font-semibold">75 kg</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Medical History */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <History className="w-4 h-4 text-primary" />
                    Medical History
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {currentPatient.medicalHistory?.chronicConditions && currentPatient.medicalHistory.chronicConditions.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Chronic Conditions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {currentPatient.medicalHistory.chronicConditions.map((condition, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{condition}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {currentPatient.medicalHistory?.currentMedications && currentPatient.medicalHistory.currentMedications.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Current Medications</p>
                      <div className="space-y-1.5">
                        {currentPatient.medicalHistory.currentMedications.map((med, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <Pill className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{med.name} {med.dosage}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {patientReports.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Recent Reports</p>
                      <div className="space-y-1.5">
                        {patientReports.slice(0, 3).map((report) => (
                          <div key={report.id} className="flex items-center gap-2 text-sm">
                            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="truncate">{report.diagnosis}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right - Consultation Notes */}
            <div className="lg:col-span-2">
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-primary" />
                      Consultation
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={isRecording ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => setIsRecording(!isRecording)}
                        className="gap-2"
                      >
                        {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        {isRecording ? "Stop" : "Record"}
                      </Button>
                      <Dialog open={aiSuggestionOpen} onOpenChange={setAiSuggestionOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <Sparkles className="w-4 h-4" />
                            AI Assist
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>AI Documentation Assistant</DialogTitle>
                            <DialogDescription>
                              Get AI-powered suggestions for diagnosis and treatment based on symptoms.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 pt-4">
                            <div className="p-4 rounded-lg bg-muted">
                              <p className="text-sm font-medium mb-2">Based on the symptoms described:</p>
                              <ul className="text-sm text-muted-foreground space-y-1">
                                <li>• Consider checking blood glucose levels</li>
                                <li>• Review current medication dosages</li>
                                <li>• Schedule follow-up in 2-4 weeks</li>
                              </ul>
                            </div>
                            <Button className="w-full gap-2">
                              <MessageSquare className="w-4 h-4" />
                              Ask AI a Question
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-auto">
                  <Tabs defaultValue="notes" className="h-full flex flex-col">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="notes">Notes</TabsTrigger>
                      <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
                      <TabsTrigger value="prescription">Prescription</TabsTrigger>
                      <TabsTrigger value="billing">Billing</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="notes" className="flex-1 mt-4">
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="symptoms">Chief Complaint / Symptoms</Label>
                          <Textarea
                            id="symptoms"
                            placeholder="Enter patient's chief complaint and symptoms..."
                            className="mt-1.5 min-h-[100px]"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="examination">Physical Examination</Label>
                          <Textarea
                            id="examination"
                            placeholder="Document physical examination findings..."
                            className="mt-1.5 min-h-[100px]"
                          />
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="diagnosis" className="flex-1 mt-4">
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="diagnosis">Diagnosis</Label>
                          <Textarea
                            id="diagnosis"
                            placeholder="Enter diagnosis..."
                            className="mt-1.5 min-h-[80px]"
                            value={diagnosis}
                            onChange={(e) => setDiagnosis(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="treatment">Treatment Plan</Label>
                          <Textarea
                            id="treatment"
                            placeholder="Enter treatment plan..."
                            className="mt-1.5 min-h-[100px]"
                            value={treatment}
                            onChange={(e) => setTreatment(e.target.value)}
                          />
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="prescription" className="flex-1 mt-4">
                      <div className="space-y-4">
                        {prescriptions.map((rx, index) => (
                          <div key={index} className="p-4 rounded-lg border border-border space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <Label>Medication</Label>
                                <Input 
                                  placeholder="Drug name" 
                                  className="mt-1"
                                  value={rx.medication}
                                  onChange={(e) => {
                                    const updated = [...prescriptions]
                                    updated[index].medication = e.target.value
                                    setPrescriptions(updated)
                                  }}
                                />
                              </div>
                              <div>
                                <Label>Dosage</Label>
                                <Input 
                                  placeholder="e.g. 500mg" 
                                  className="mt-1"
                                  value={rx.dosage}
                                  onChange={(e) => {
                                    const updated = [...prescriptions]
                                    updated[index].dosage = e.target.value
                                    setPrescriptions(updated)
                                  }}
                                />
                              </div>
                              <div>
                                <Label>Frequency</Label>
                                <Input 
                                  placeholder="e.g. Twice daily" 
                                  className="mt-1"
                                  value={rx.frequency}
                                  onChange={(e) => {
                                    const updated = [...prescriptions]
                                    updated[index].frequency = e.target.value
                                    setPrescriptions(updated)
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        <Button variant="outline" onClick={addPrescription} className="w-full gap-2">
                          <Plus className="w-4 h-4" />
                          Add Medication
                        </Button>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="billing" className="flex-1 mt-4">
                      <div className="space-y-4">
                        <div className="p-4 rounded-lg bg-muted/50">
                          <p className="text-sm font-medium mb-2">Insurance Type</p>
                          <Badge className="capitalize">{currentPatient.insuranceType}</Badge>
                        </div>
                        <div>
                          <Label>Billing Codes</Label>
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                              <div>
                                <p className="font-medium text-sm">03000 - Versichertenpauschale</p>
                                <p className="text-xs text-muted-foreground">EBM Code</p>
                              </div>
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
                
                {/* Action Footer */}
                <div className="p-4 border-t border-border flex flex-col sm:flex-row gap-2 sm:justify-between">
                  <Button variant="outline" className="gap-2">
                    <Save className="w-4 h-4" />
                    Save Draft
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" className="gap-2">
                      <FileCheck className="w-4 h-4" />
                      Generate Report
                    </Button>
                    <Button className="gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Complete Consultation
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
