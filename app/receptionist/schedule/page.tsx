"use client"

import { useState } from "react"
import { 
  ChevronLeft, ChevronRight, Plus, Filter, Calendar as CalendarIcon,
  Clock, User, MoreHorizontal
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { mockAppointments, mockDoctors, mockPatients } from "@/lib/mock-data"
import { toast } from "sonner"
import type { AppointmentStatus } from "@/lib/types"

const timeSlots = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00"
]

export default function ReceptionistSchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDoctor, setSelectedDoctor] = useState<string>("all")
  const [isBookingOpen, setIsBookingOpen] = useState(false)
  const [newAppointment, setNewAppointment] = useState({
    patientId: "",
    doctorId: "",
    date: "",
    time: "",
    reason: "",
  })

  // Get appointments for the current week
  const getWeekDates = () => {
    const dates: Date[] = []
    const startOfWeek = new Date(currentDate)
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay() + 1) // Monday
    
    for (let i = 0; i < 5; i++) { // Mon-Fri
      const date = new Date(startOfWeek)
      date.setDate(startOfWeek.getDate() + i)
      dates.push(date)
    }
    return dates
  }

  const weekDates = getWeekDates()

  const getAppointmentsForSlot = (date: Date, time: string, doctorId?: string) => {
    return mockAppointments.filter(apt => {
      const aptDate = new Date(apt.dateTime)
      const aptTime = aptDate.toTimeString().slice(0, 5)
      const sameDay = aptDate.toDateString() === date.toDateString()
      const sameTime = aptTime === time
      const matchesDoctor = !doctorId || doctorId === "all" || apt.doctorId === doctorId
      return sameDay && sameTime && matchesDoctor
    })
  }

  const prevWeek = () => {
    const newDate = new Date(currentDate)
    newDate.setDate(currentDate.getDate() - 7)
    setCurrentDate(newDate)
  }

  const nextWeek = () => {
    const newDate = new Date(currentDate)
    newDate.setDate(currentDate.getDate() + 7)
    setCurrentDate(newDate)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const getStatusColor = (status: AppointmentStatus) => {
    switch (status) {
      case "waiting": return "bg-yellow-500"
      case "in-progress": return "bg-blue-500"
      case "completed": return "bg-green-500"
      case "cancelled": return "bg-red-500"
      default: return "bg-primary"
    }
  }

  const handleBookAppointment = async () => {
    if (!newAppointment.patientId || !newAppointment.doctorId || 
        !newAppointment.date || !newAppointment.time || !newAppointment.reason) {
      toast.error("Please fill in all fields")
      return
    }

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    toast.success("Appointment booked successfully")
    setIsBookingOpen(false)
    setNewAppointment({ patientId: "", doctorId: "", date: "", time: "", reason: "" })
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Schedule</h1>
          <p className="text-muted-foreground">Manage appointments and schedules</p>
        </div>
        <Dialog open={isBookingOpen} onOpenChange={setIsBookingOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Book Appointment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Book New Appointment</DialogTitle>
              <DialogDescription>
                Schedule a new appointment for a patient
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Select 
                  value={newAppointment.patientId} 
                  onValueChange={(v) => setNewAppointment({...newAppointment, patientId: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {mockPatients.map(patient => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Doctor</Label>
                <Select 
                  value={newAppointment.doctorId} 
                  onValueChange={(v) => setNewAppointment({...newAppointment, doctorId: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {mockDoctors.map(doctor => (
                      <SelectItem key={doctor.id} value={doctor.id}>
                        {doctor.name} - {doctor.department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input 
                    type="date" 
                    value={newAppointment.date}
                    onChange={(e) => setNewAppointment({...newAppointment, date: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Select 
                    value={newAppointment.time} 
                    onValueChange={(v) => setNewAppointment({...newAppointment, time: v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map(time => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason for Visit</Label>
                <Textarea 
                  placeholder="Brief description of the visit reason..."
                  value={newAppointment.reason}
                  onChange={(e) => setNewAppointment({...newAppointment, reason: e.target.value})}
                />
              </div>
              <Button className="w-full" onClick={handleBookAppointment}>
                Book Appointment
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Controls */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Week Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevWeek}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={goToToday}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={nextWeek}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="ml-2 font-medium text-foreground">
                {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {weekDates[4].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </div>

            {/* Doctor Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by doctor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Doctors</SelectItem>
                  {mockDoctors.map(doctor => (
                    <SelectItem key={doctor.id} value={doctor.id}>
                      {doctor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Grid */}
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Header Row - Days */}
            <div className="grid grid-cols-6 gap-2 mb-4">
              <div className="w-16" /> {/* Time column header */}
              {weekDates.map((date, idx) => (
                <div 
                  key={idx} 
                  className={`text-center p-3 rounded-lg ${
                    isToday(date) ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  <p className="text-sm font-medium">
                    {date.toLocaleDateString("en-US", { weekday: "short" })}
                  </p>
                  <p className="text-lg font-bold">
                    {date.getDate()}
                  </p>
                </div>
              ))}
            </div>

            {/* Time Slots */}
            <div className="space-y-1">
              {timeSlots.filter((_, i) => i % 2 === 0).map((time) => (
                <div key={time} className="grid grid-cols-6 gap-2">
                  {/* Time Label */}
                  <div className="w-16 text-sm text-muted-foreground text-right pr-2 py-3">
                    {time}
                  </div>
                  
                  {/* Day Columns */}
                  {weekDates.map((date, dayIdx) => {
                    const appointments = getAppointmentsForSlot(date, time, selectedDoctor)
                    
                    return (
                      <div 
                        key={dayIdx}
                        className="min-h-[60px] border border-border rounded-lg p-1 bg-card hover:bg-accent/30 transition-colors"
                      >
                        {appointments.map((apt) => (
                          <DropdownMenu key={apt.id}>
                            <DropdownMenuTrigger asChild>
                              <button className={`w-full text-left p-2 rounded text-xs text-white ${getStatusColor(apt.status)} hover:opacity-90`}>
                                <p className="font-medium truncate">{apt.patientName}</p>
                                <p className="opacity-80 truncate">{apt.doctorName.split(" ")[0]}</p>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem>View Details</DropdownMenuItem>
                              <DropdownMenuItem>Check In Patient</DropdownMenuItem>
                              <DropdownMenuItem>Reschedule</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">Cancel</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-sm text-muted-foreground">Scheduled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="text-sm text-muted-foreground">Waiting</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-sm text-muted-foreground">In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm text-muted-foreground">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-sm text-muted-foreground">Cancelled</span>
        </div>
      </div>
    </div>
  )
}
