"use client"

import Link from "next/link"
import { 
  Calendar, FileText, Clock, ArrowRight, Smartphone, CalendarPlus,
  Activity, Heart, Bell, ChevronRight, MapPin, User, Shield,
  Pill, AlertCircle, TrendingUp
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { mockAppointments, mockMedicalReports, currentUser } from "@/lib/mock-data"

export default function PatientDashboard() {
  const patient = currentUser.patient
  
  // Get upcoming appointments for this patient
  const upcomingAppointments = mockAppointments
    .filter(apt => apt.patientId === patient.id && apt.status === "scheduled")
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
  
  // Get recent reports
  const recentReports = mockMedicalReports
    .filter(report => report.patientId === patient.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3)

  const formatDateTime = (date: Date) => {
    const d = new Date(date)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    let dayStr = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    if (d.toDateString() === today.toDateString()) dayStr = "Today"
    else if (d.toDateString() === tomorrow.toDateString()) dayStr = "Tomorrow"
    
    const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    return { day: dayStr, time: timeStr }
  }

  const isToday = (date: Date) => {
    const d = new Date(date)
    const today = new Date()
    return d.toDateString() === today.toDateString()
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

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/5 via-primary/10 to-transparent border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-background shadow-xl">
                <AvatarFallback className="bg-primary text-primary-foreground text-xl sm:text-2xl font-bold">
                  {patient.name.split(" ").map(n => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                  Hello, {patient.name.split(" ")[0]}
                </h1>
                <p className="text-muted-foreground mt-1">
                  Welcome back to your health portal
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs">
                    <Shield className="w-3 h-3 mr-1" />
                    {patient.insuranceType === "public" ? "Public Insurance" : 
                     patient.insuranceType === "private" ? "Private Insurance" : "Self-Pay"}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Link href="/patient/appointments/new">
                <Button size="lg" className="gap-2 shadow-lg w-full sm:w-auto">
                  <CalendarPlus className="w-5 h-5" />
                  Book Appointment
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-primary uppercase tracking-wide">Upcoming</p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{upcomingAppointments.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">appointments</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Records</p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{recentReports.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">health reports</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-muted flex items-center justify-center">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Medications</p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">
                    {patient.medicalHistory?.currentMedications?.length || 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">active prescriptions</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-muted flex items-center justify-center">
                  <Pill className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-200 bg-emerald-50/30">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Health Score</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-800 mt-1">Good</p>
                  <p className="text-xs text-emerald-600 mt-1">keep it up!</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Column - Upcoming Appointments */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-primary" />
                      Upcoming Appointments
                    </CardTitle>
                    <CardDescription>Your scheduled visits</CardDescription>
                  </div>
                  <Link href="/patient/appointments">
                    <Button variant="ghost" size="sm" className="gap-1">
                      View all <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {upcomingAppointments.length > 0 ? (
                  <div className="space-y-4">
                    {upcomingAppointments.slice(0, 3).map((appointment, index) => {
                      const { day, time } = formatDateTime(appointment.dateTime)
                      const canCheckIn = isToday(appointment.dateTime)
                      
                      return (
                        <div
                          key={appointment.id}
                          className={`group p-4 sm:p-5 rounded-xl border transition-all duration-200 hover:shadow-lg ${
                            canCheckIn 
                              ? "border-primary/30 bg-gradient-to-r from-primary/5 to-transparent" 
                              : "border-border hover:border-primary/20"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                            <div className="flex items-start gap-4 flex-1">
                              <Avatar className="w-12 h-12 sm:w-14 sm:h-14 border-2 border-background shadow-lg">
                                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                  {appointment.doctorName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-foreground text-lg">
                                  {appointment.doctorName}
                                </h3>
                                <p className="text-muted-foreground">{appointment.reason}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                  <Badge variant="outline" className="gap-1.5">
                                    <Calendar className="w-3 h-3" />
                                    {day}
                                  </Badge>
                                  <Badge variant="outline" className="gap-1.5">
                                    <Clock className="w-3 h-3" />
                                    {time}
                                  </Badge>
                                  <Badge variant="secondary" className="gap-1.5">
                                    <MapPin className="w-3 h-3" />
                                    Room 101
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                              {canCheckIn ? (
                                <Link href={`/patient/check-in/${appointment.id}`}>
                                  <Button className="w-full sm:w-auto gap-2 shadow-md">
                                    <Smartphone className="w-4 h-4" />
                                    Self Check-in
                                  </Button>
                                </Link>
                              ) : (
                                <Button variant="outline" className="w-full sm:w-auto gap-2" disabled>
                                  <Clock className="w-4 h-4" />
                                  {index === 0 ? "Check-in opens soon" : "Upcoming"}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
                      <Calendar className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground">No upcoming appointments</p>
                    <p className="text-sm text-muted-foreground mt-1">Book your next visit with us</p>
                    <Link href="/patient/appointments/new">
                      <Button className="mt-4 gap-2">
                        <CalendarPlus className="w-4 h-4" />
                        Book Appointment
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Health Alerts */}
            {patient.medicalHistory?.allergies && patient.medicalHistory.allergies.length > 0 && (
              <Card className="border-amber-200/50 bg-amber-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    Health Reminders
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 rounded-xl bg-amber-100/50 border border-amber-200">
                    <p className="text-sm font-medium text-amber-800">Known Allergies</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {patient.medicalHistory.allergies.map((allergy, i) => (
                        <Badge key={i} variant="destructive" className="text-xs">
                          {allergy}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {patient.medicalHistory.chronicConditions && patient.medicalHistory.chronicConditions.length > 0 && (
                    <div className="p-3 rounded-xl bg-blue-100/50 border border-blue-200">
                      <p className="text-sm font-medium text-blue-800">Chronic Conditions</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {patient.medicalHistory.chronicConditions.map((condition, i) => (
                          <Badge key={i} variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                            {condition}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Recent Reports & Quick Actions */}
          <div className="space-y-6">
            {/* Recent Health Records */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FileText className="w-5 h-5 text-primary" />
                      Health Records
                    </CardTitle>
                    <CardDescription>Latest medical reports</CardDescription>
                  </div>
                  <Link href="/patient/records">
                    <Button variant="ghost" size="sm" className="gap-1">
                      All <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {recentReports.length > 0 ? (
                  <div className="space-y-3">
                    {recentReports.map((report) => (
                      <Link 
                        key={report.id} 
                        href={`/patient/records/${report.id}`}
                        className="block"
                      >
                        <div className="group p-4 rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-muted-foreground">
                                {new Date(report.date).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </p>
                              <h4 className="font-medium text-foreground mt-1 truncate">
                                {report.diagnosis}
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                {report.doctorName}
                              </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-30" />
                    <p className="text-sm text-muted-foreground">No health records yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Current Medications */}
            {patient.medicalHistory?.currentMedications && patient.medicalHistory.currentMedications.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Pill className="w-5 h-5 text-primary" />
                    Current Medications
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {patient.medicalHistory.currentMedications.map((med, i) => (
                      <div key={i} className="p-3 rounded-xl border border-border">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">{med.name}</p>
                            <p className="text-sm text-muted-foreground">{med.dosage} • {med.frequency}</p>
                          </div>
                          <Badge variant="outline" className="text-xs">Active</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/patient/appointments/new">
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CalendarPlus className="w-4 h-4 text-primary" />
                    </div>
                    Book New Appointment
                  </Button>
                </Link>
                <Link href="/patient/records">
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    View All Records
                  </Button>
                </Link>
                <Link href="/patient/profile">
                  <Button variant="outline" className="w-full justify-start gap-3 h-12">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    Update Profile
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
