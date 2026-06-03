"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Calendar, Clock, Users, FileText, ArrowRight, AlertCircle,
  CheckCircle2, Play, Pause, UserCheck, TrendingUp, Activity,
  Stethoscope, ChevronRight, Timer, Target
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { mockAppointments, mockPatients, currentUser, getTodayAppointments } from "@/lib/mock-data"

export default function DoctorDashboard() {
  const doctor = currentUser.doctor
  const today = new Date()

  // Get today's appointments for this doctor
  const todayAppointments = getTodayAppointments()
    .filter(apt => apt.doctorId === doctor.id)
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())

  // Stats
  const stats = {
    total: todayAppointments.length,
    completed: todayAppointments.filter(a => a.status === "completed").length,
    waiting: todayAppointments.filter(a => a.status === "waiting").length,
    inProgress: todayAppointments.filter(a => a.status === "in-progress").length,
    upcoming: todayAppointments.filter(a => a.status === "scheduled").length,
    noShow: todayAppointments.filter(a => a.status === "no-show").length,
  }

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  // Current patient (first in-progress or waiting)
  const currentPatient = todayAppointments.find(a => a.status === "in-progress") ||
                         todayAppointments.find(a => a.status === "waiting")

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "waiting":
        return { color: "bg-amber-500", textColor: "text-amber-700", bgColor: "bg-amber-50", label: "Waiting" }
      case "in-progress":
        return { color: "bg-blue-500", textColor: "text-blue-700", bgColor: "bg-blue-50", label: "In Progress" }
      case "completed":
        return { color: "bg-emerald-500", textColor: "text-emerald-700", bgColor: "bg-emerald-50", label: "Completed" }
      case "scheduled":
        return { color: "bg-slate-400", textColor: "text-slate-600", bgColor: "bg-slate-50", label: "Scheduled" }
      case "no-show":
        return { color: "bg-red-500", textColor: "text-red-700", bgColor: "bg-red-50", label: "No Show" }
      default:
        return { color: "bg-slate-400", textColor: "text-slate-600", bgColor: "bg-slate-50", label: status }
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Good Morning, Dr. {doctor.name.split(" ").pop()}</h1>
          <p className="text-muted-foreground mt-1">
            {today.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric"
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/doctor/workspace">
            <Button className="gap-2 shadow-lg">
              <Play className="w-4 h-4" />
              Start Consultations
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Today&apos;s Patients</p>
                <p className="text-3xl font-bold text-foreground mt-1">{stats.total}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.completed} completed</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Users className="w-7 h-7 text-primary" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/20">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-amber-200 bg-amber-50/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-700">Waiting</p>
                <p className="text-3xl font-bold text-amber-800 mt-1">{stats.waiting}</p>
                <p className="text-xs text-amber-600 mt-1">patients in queue</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
                <Clock className="w-7 h-7 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-blue-200 bg-blue-50/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700">In Progress</p>
                <p className="text-3xl font-bold text-blue-800 mt-1">{stats.inProgress}</p>
                <p className="text-xs text-blue-600 mt-1">active consultation</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
                <Activity className="w-7 h-7 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-emerald-200 bg-emerald-50/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700">Completed</p>
                <p className="text-3xl font-bold text-emerald-800 mt-1">{stats.completed}</p>
                <p className="text-xs text-emerald-600 mt-1">{completionRate}% completion</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left - Current/Next Patient */}
        <div className="lg:col-span-2 space-y-6">
          {/* Current Patient Card */}
          {currentPatient && (
            <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    {currentPatient.status === "in-progress" ? "Current Patient" : "Next Patient"}
                  </CardTitle>
                  <Badge className={`${getStatusConfig(currentPatient.status).bgColor} ${getStatusConfig(currentPatient.status).textColor} border-0`}>
                    {getStatusConfig(currentPatient.status).label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                  <Avatar className="w-20 h-20 border-4 border-background shadow-lg">
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
                      {currentPatient.patientName.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="text-xl font-bold text-foreground">{currentPatient.patientName}</h3>
                      <p className="text-muted-foreground">{currentPatient.reason}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>Scheduled: {formatTime(currentPatient.dateTime)}</span>
                      </div>
                      {currentPatient.checkInTime && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <UserCheck className="w-4 h-4" />
                          <span>Checked in: {formatTime(currentPatient.checkInTime)}</span>
                        </div>
                      )}
                    </div>
                    {(() => {
                      const patient = mockPatients.find(p => p.id === currentPatient.patientId)
                      if (patient?.medicalHistory) {
                        return (
                          <div className="flex flex-wrap gap-2">
                            {patient.medicalHistory.allergies.map((allergy, i) => (
                              <Badge key={i} variant="destructive" className="text-xs">
                                Allergy: {allergy}
                              </Badge>
                            ))}
                            {patient.medicalHistory.chronicConditions.map((condition, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {condition}
                              </Badge>
                            ))}
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                  <div className="flex sm:flex-col gap-2">
                    <Link href={`/doctor/workspace?patient=${currentPatient.id}`}>
                      <Button className="gap-2 w-full">
                        <Stethoscope className="w-4 h-4" />
                        Start Consult
                      </Button>
                    </Link>
                    <Button variant="outline" className="gap-2 w-full">
                      <FileText className="w-4 h-4" />
                      View History
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Today's Schedule */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  Today&apos;s Schedule
                </CardTitle>
                <CardDescription>{stats.upcoming} upcoming appointments</CardDescription>
              </div>
              <Link href="/doctor/schedule">
                <Button variant="ghost" size="sm" className="gap-1">
                  View All <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {todayAppointments.length > 0 ? (
                <div className="space-y-3">
                  {todayAppointments.map((appointment, index) => {
                    const statusConfig = getStatusConfig(appointment.status)
                    const patient = mockPatients.find(p => p.id === appointment.patientId)

                    return (
                      <div
                        key={appointment.id}
                        className={`group flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 hover:shadow-md ${
                          appointment.status === "in-progress"
                            ? "border-blue-200 bg-blue-50/50"
                            : appointment.status === "waiting"
                            ? "border-amber-200 bg-amber-50/50"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        {/* Time Column */}
                        <div className="text-center min-w-[70px]">
                          <p className="font-bold text-foreground">{formatTime(appointment.dateTime)}</p>
                          <p className="text-xs text-muted-foreground">30 min</p>
                        </div>

                        {/* Status Indicator */}
                        <div className={`w-1.5 h-14 rounded-full ${statusConfig.color}`} />

                        {/* Patient Info */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="w-10 h-10 border-2 border-background shadow">
                            <AvatarFallback className={`${statusConfig.bgColor} ${statusConfig.textColor} font-semibold text-sm`}>
                              {appointment.patientName.split(" ").map(n => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground truncate">{appointment.patientName}</p>
                            <p className="text-sm text-muted-foreground truncate">{appointment.reason}</p>
                          </div>
                        </div>

                        {/* Alerts */}
                        <div className="hidden md:flex items-center gap-2">
                          {patient?.medicalHistory?.allergies && patient.medicalHistory.allergies.length > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Allergies
                            </Badge>
                          )}
                        </div>

                        {/* Status Badge */}
                        <Badge className={`${statusConfig.bgColor} ${statusConfig.textColor} border-0 whitespace-nowrap`}>
                          {statusConfig.label}
                        </Badge>

                        {/* Action */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="font-medium">No appointments scheduled for today</p>
                  <p className="text-sm">Enjoy your day off!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Today&apos;s Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Consultations</span>
                  <span className="text-sm font-semibold">{stats.completed}/{stats.total}</span>
                </div>
                <Progress value={completionRate} className="h-2" />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="text-center p-3 rounded-xl bg-muted/50">
                  <p className="text-2xl font-bold text-foreground">{stats.upcoming}</p>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-muted/50">
                  <p className="text-2xl font-bold text-foreground">~{stats.upcoming * 30}</p>
                  <p className="text-xs text-muted-foreground">Minutes Left</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending Tasks */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Pending Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Reports to Sign</p>
                      <p className="text-xs text-muted-foreground">2 pending approval</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-amber-700 border-amber-300">2</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl border border-blue-200 bg-blue-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Timer className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Lab Results</p>
                      <p className="text-xs text-muted-foreground">3 awaiting review</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-blue-700 border-blue-300">3</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/doctor/workspace">
                <Button variant="outline" className="w-full justify-start gap-3 h-12">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Stethoscope className="w-4 h-4 text-primary" />
                  </div>
                  Open Workspace
                </Button>
              </Link>
              <Link href="/doctor/patients">
                <Button variant="outline" className="w-full justify-start gap-3 h-12">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  Patient Records
                </Button>
              </Link>
              <Link href="/doctor/reports">
                <Button variant="outline" className="w-full justify-start gap-3 h-12">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  Medical Reports
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
