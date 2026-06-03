"use client"

import { useState } from "react"
import Link from "next/link"
import { 
  Calendar, Clock, Users, UserPlus, AlertCircle, CheckCircle2, 
  ArrowRight, Bell, ChevronRight, Stethoscope, Search, Filter,
  Plus, Phone, Mail, Activity, TrendingUp, MoreHorizontal
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { mockAppointments, mockPatients, mockDoctors } from "@/lib/mock-data"

export default function ReceptionistDashboard() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Get today's appointments
  const todayAppointments = mockAppointments
    .filter(apt => {
      const aptDate = new Date(apt.dateTime)
      aptDate.setHours(0, 0, 0, 0)
      return aptDate.getTime() === today.getTime()
    })
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())

  // Stats
  const stats = {
    todayTotal: todayAppointments.length,
    waiting: todayAppointments.filter(a => a.status === "waiting").length,
    completed: todayAppointments.filter(a => a.status === "completed").length,
    upcoming: todayAppointments.filter(a => a.status === "scheduled").length,
    noShow: todayAppointments.filter(a => a.status === "no-show").length,
  }

  const completionRate = stats.todayTotal > 0 
    ? Math.round((stats.completed / stats.todayTotal) * 100) 
    : 0

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "waiting": 
        return { color: "bg-amber-500", textColor: "text-amber-700", bgColor: "bg-amber-50", label: "Waiting", dotColor: "bg-amber-500" }
      case "in-progress": 
        return { color: "bg-blue-500", textColor: "text-blue-700", bgColor: "bg-blue-50", label: "With Doctor", dotColor: "bg-blue-500" }
      case "completed": 
        return { color: "bg-emerald-500", textColor: "text-emerald-700", bgColor: "bg-emerald-50", label: "Completed", dotColor: "bg-emerald-500" }
      case "scheduled": 
        return { color: "bg-slate-400", textColor: "text-slate-600", bgColor: "bg-slate-50", label: "Scheduled", dotColor: "bg-slate-400" }
      case "no-show": 
        return { color: "bg-red-500", textColor: "text-red-700", bgColor: "bg-red-50", label: "No Show", dotColor: "bg-red-500" }
      default: 
        return { color: "bg-slate-400", textColor: "text-slate-600", bgColor: "bg-slate-50", label: status, dotColor: "bg-slate-400" }
    }
  }

  // Filter appointments based on search
  const filteredAppointments = todayAppointments.filter(apt =>
    apt.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    apt.doctorName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Reception Dashboard</h1>
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
          <Button variant="outline" className="gap-2">
            <UserPlus className="w-4 h-4" />
            New Patient
          </Button>
          <Link href="/receptionist/schedule">
            <Button className="gap-2 shadow-lg">
              <Plus className="w-4 h-4" />
              Book Appointment
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="relative overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Today</p>
                <p className="text-3xl font-bold text-foreground mt-1">{stats.todayTotal}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Progress value={completionRate} className="h-1.5 flex-1" />
              <span className="text-xs text-muted-foreground">{completionRate}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Waiting</p>
                <p className="text-3xl font-bold text-amber-800 mt-1">{stats.waiting}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
            </div>
            <p className="text-xs text-amber-600 mt-3">In waiting room</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Completed</p>
                <p className="text-3xl font-bold text-emerald-800 mt-1">{stats.completed}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
            <p className="text-xs text-emerald-600 mt-3">Visits completed</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Upcoming</p>
                <p className="text-3xl font-bold text-blue-800 mt-1">{stats.upcoming}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-3">Yet to arrive</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-red-700 uppercase tracking-wide">No Shows</p>
                <p className="text-3xl font-bold text-red-800 mt-1">{stats.noShow}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-red-600 mt-3">Missed appointments</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" />
                    Today&apos;s Schedule
                  </CardTitle>
                  <CardDescription>{filteredAppointments.length} appointments</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search patients..."
                      className="pl-9 w-full sm:w-[200px]"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Link href="/receptionist/schedule">
                    <Button variant="outline" size="sm" className="gap-1">
                      View All <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredAppointments.length > 0 ? (
                <div className="space-y-3">
                  {filteredAppointments.map((appointment) => {
                    const statusConfig = getStatusConfig(appointment.status)
                    const patient = mockPatients.find(p => p.id === appointment.patientId)
                    
                    return (
                      <div
                        key={appointment.id}
                        className={`group flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 hover:shadow-md cursor-pointer ${
                          appointment.status === "waiting" 
                            ? "border-amber-200 bg-amber-50/50" 
                            : appointment.status === "in-progress"
                            ? "border-blue-200 bg-blue-50/50"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        {/* Time */}
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

                        {/* Doctor */}
                        <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                          <Stethoscope className="w-4 h-4" />
                          <span className="truncate max-w-[120px]">{appointment.doctorName}</span>
                        </div>

                        {/* Status Badge */}
                        <Badge className={`${statusConfig.bgColor} ${statusConfig.textColor} border-0 whitespace-nowrap`}>
                          {statusConfig.label}
                        </Badge>

                        {/* Actions */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>Check In Patient</DropdownMenuItem>
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                            <DropdownMenuItem>Reschedule</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">Cancel</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="font-medium">No appointments found</p>
                  <p className="text-sm">{searchQuery ? "Try a different search term" : "No appointments scheduled for today"}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Waiting Room */}
          <Card className="border-amber-200/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Waiting Room
                </CardTitle>
                <Link href="/receptionist/waiting">
                  <Button variant="ghost" size="sm">Manage</Button>
                </Link>
              </div>
              <CardDescription>{stats.waiting} patients waiting</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.waiting > 0 ? (
                <div className="space-y-3">
                  {todayAppointments
                    .filter(a => a.status === "waiting")
                    .map((appointment) => (
                      <div
                        key={appointment.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50/50"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="w-9 h-9">
                            <AvatarFallback className="bg-amber-100 text-amber-800 text-xs font-medium">
                              {appointment.patientName.split(" ").map(n => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium text-foreground">{appointment.patientName}</p>
                            <p className="text-xs text-muted-foreground">
                              Since {formatTime(appointment.checkInTime || appointment.dateTime)}
                            </p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="h-8">
                          Call
                        </Button>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No patients waiting</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Doctor Availability */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-primary" />
                Doctor Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockDoctors.slice(0, 3).map((doctor) => {
                const doctorAppointments = todayAppointments.filter(a => a.doctorId === doctor.id)
                const currentPatient = doctorAppointments.find(a => a.status === "in-progress")
                const waitingCount = doctorAppointments.filter(a => a.status === "waiting").length
                
                return (
                  <div key={doctor.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">
                        {doctor.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{doctor.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{doctor.specialization}</p>
                    </div>
                    <div className="text-right">
                      {currentPatient ? (
                        <Badge className="bg-blue-50 text-blue-700 border-0 text-xs">Busy</Badge>
                      ) : (
                        <Badge className="bg-emerald-50 text-emerald-700 border-0 text-xs">Available</Badge>
                      )}
                      {waitingCount > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">{waitingCount} waiting</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <UserPlus className="w-5 h-5" />
                <span className="text-xs">New Patient</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <Calendar className="w-5 h-5" />
                <span className="text-xs">Book Apt.</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <Phone className="w-5 h-5" />
                <span className="text-xs">Call Patient</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <Mail className="w-5 h-5" />
                <span className="text-xs">Send Reminder</span>
              </Button>
            </CardContent>
          </Card>

          {/* Alerts */}
          <Card className="border-destructive/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertCircle className="w-5 h-5 text-destructive" />
                Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <p className="text-sm font-medium text-destructive">Missing Insurance</p>
                <p className="text-xs text-muted-foreground mt-1">2 patients need verification</p>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm font-medium text-amber-700">Pending Confirmations</p>
                <p className="text-xs text-muted-foreground mt-1">3 appointments unconfirmed</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
