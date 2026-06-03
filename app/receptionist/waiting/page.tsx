"use client"

import { useState } from "react"
import {
  Clock, CheckCircle2, User, Stethoscope,
  AlertCircle, Bell, GripVertical, MoveRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { mockAppointments, mockPatients } from "@/lib/mock-data"
import { toast } from "sonner"
import type { AppointmentStatus, Appointment } from "@/lib/types"

// The three columns the board supports, and how each maps to a status.
type ColumnStatus = "waiting" | "in-progress" | "completed"

const COLUMN_LABELS: Record<ColumnStatus, string> = {
  waiting: "Waiting",
  "in-progress": "With Doctor",
  completed: "Completed",
}

export default function WaitingRoomPage() {
  const [appointments, setAppointments] = useState(mockAppointments)
  const [callDialogOpen, setCallDialogOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Appointment | null>(null)

  // Drag-and-drop state
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<ColumnStatus | null>(null)
  // Pending move awaiting confirmation (so a drop never applies by accident)
  const [pendingMove, setPendingMove] = useState<{
    appointment: Appointment
    target: ColumnStatus
  } | null>(null)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Get today's appointments grouped by status
  const todayAppointments = appointments.filter(apt => {
    const aptDate = new Date(apt.dateTime)
    aptDate.setHours(0, 0, 0, 0)
    return aptDate.getTime() === today.getTime()
  })

  const waitingPatients = todayAppointments
    .filter(apt => apt.status === "waiting")
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())

  const inProgressPatients = todayAppointments
    .filter(apt => apt.status === "in-progress")

  const completedPatients = todayAppointments
    .filter(apt => apt.status === "completed")
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getWaitTime = (dateTime: Date) => {
    const now = new Date()
    const checkinTime = new Date(dateTime)
    const diffMs = now.getTime() - checkinTime.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins} min`
    return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`
  }

  // ---- Drag and drop ------------------------------------------------------

  const handleDragStart = (e: React.DragEvent, appointment: Appointment) => {
    setDraggedId(appointment.id)
    e.dataTransfer.effectAllowed = "move"
    // Firefox requires data to be set for the drag to initiate
    e.dataTransfer.setData("text/plain", appointment.id)
  }

  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverColumn(null)
  }

  const handleDragOver = (e: React.DragEvent, status: ColumnStatus) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (dragOverColumn !== status) setDragOverColumn(status)
  }

  const handleDrop = (e: React.DragEvent, target: ColumnStatus) => {
    e.preventDefault()
    const id = draggedId ?? e.dataTransfer.getData("text/plain")
    setDragOverColumn(null)
    setDraggedId(null)
    if (!id) return

    const appointment = appointments.find(a => a.id === id)
    if (!appointment) return
    // Dropped back into its own column — nothing to do.
    if (appointment.status === target) return

    // Ask for confirmation instead of applying immediately.
    setPendingMove({ appointment, target })
  }

  const confirmMove = () => {
    if (!pendingMove) return
    const { appointment, target } = pendingMove
    setAppointments(prev =>
      prev.map(apt =>
        apt.id === appointment.id
          ? { ...apt, status: target as AppointmentStatus }
          : apt
      )
    )
    toast.success(
      `${appointment.patientName} moved to "${COLUMN_LABELS[target]}"`
    )
    setPendingMove(null)
  }

  // ---- Existing button actions (kept as the click/keyboard path) ----------

  const handleCallPatient = (appointment: Appointment) => {
    setSelectedPatient(appointment)
    setCallDialogOpen(true)
  }

  const confirmCallPatient = () => {
    if (!selectedPatient) return

    setAppointments(prev =>
      prev.map(apt =>
        apt.id === selectedPatient.id
          ? { ...apt, status: "in-progress" as AppointmentStatus }
          : apt
      )
    )
    toast.success(`${selectedPatient.patientName} has been called to ${selectedPatient.doctorName}'s office`)
    setCallDialogOpen(false)
    setSelectedPatient(null)
  }

  const handleMarkComplete = (appointmentId: string) => {
    setAppointments(prev =>
      prev.map(apt =>
        apt.id === appointmentId
          ? { ...apt, status: "completed" as AppointmentStatus }
          : apt
      )
    )
    toast.success("Appointment marked as completed")
  }

  // Shared props that make a card draggable.
  const dragProps = (appointment: Appointment) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => handleDragStart(e, appointment),
    onDragEnd: handleDragEnd,
  })

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Waiting Room</h1>
          <p className="text-muted-foreground">
            Manage patient flow and waiting times
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <GripVertical className="w-3.5 h-3.5" />
            Drag a card to another column to move a patient
          </span>
          <Badge variant="outline" className="text-sm py-1 px-3">
            <Clock className="w-4 h-4 mr-2" />
            {waitingPatients.length} Waiting
          </Badge>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Waiting Column */}
        <Card
          className={cn(
            "border-yellow-500/30 transition-all duration-200 animate-fade-up stagger-1",
            dragOverColumn === "waiting" && "ring-2 ring-yellow-500/60 ring-offset-2 shadow-lg"
          )}
          onDragOver={(e) => handleDragOver(e, "waiting")}
          onDrop={(e) => handleDrop(e, "waiting")}
        >
          <CardHeader className="bg-yellow-500/10 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-yellow-700">
              <Clock className="w-5 h-5" />
              Waiting ({waitingPatients.length})
            </CardTitle>
            <CardDescription>
              Patients waiting to be seen
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 min-h-[140px]">
            {waitingPatients.length > 0 ? (
              <div className="space-y-3">
                {waitingPatients.map((appointment, index) => {
                  const patient = mockPatients.find(p => p.id === appointment.patientId)
                  const hasAllergy = (patient?.medicalHistory?.allergies?.length ?? 0) > 0

                  return (
                    <div
                      key={appointment.id}
                      {...dragProps(appointment)}
                      className={cn(
                        "group p-4 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing transition-all duration-200 hover:shadow-md hover:border-yellow-500/40",
                        draggedId === appointment.id && "opacity-40 ring-2 ring-yellow-500/50"
                      )}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <GripVertical className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                          <div className="relative">
                            <Avatar>
                              <AvatarFallback className="bg-yellow-100 text-yellow-800">
                                {appointment.patientName.split(" ").map(n => n[0]).join("")}
                              </AvatarFallback>
                            </Avatar>
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                              {index + 1}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {appointment.patientName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Waiting: {getWaitTime(appointment.dateTime)}
                            </p>
                          </div>
                        </div>
                        {hasAllergy && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Allergy
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                        <Stethoscope className="w-4 h-4" />
                        <span>{appointment.doctorName}</span>
                      </div>

                      <p className="text-sm text-muted-foreground mb-3">
                        {appointment.reason}
                      </p>

                      <Button
                        className="w-full gap-2"
                        size="sm"
                        onClick={() => handleCallPatient(appointment)}
                      >
                        <Bell className="w-4 h-4" />
                        Call Patient
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No patients waiting</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* In Progress Column */}
        <Card
          className={cn(
            "border-blue-500/30 transition-all duration-200 animate-fade-up stagger-2",
            dragOverColumn === "in-progress" && "ring-2 ring-blue-500/60 ring-offset-2 shadow-lg"
          )}
          onDragOver={(e) => handleDragOver(e, "in-progress")}
          onDrop={(e) => handleDrop(e, "in-progress")}
        >
          <CardHeader className="bg-blue-500/10 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <User className="w-5 h-5" />
              With Doctor ({inProgressPatients.length})
            </CardTitle>
            <CardDescription>
              Patients currently being seen
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 min-h-[140px]">
            {inProgressPatients.length > 0 ? (
              <div className="space-y-3">
                {inProgressPatients.map((appointment) => (
                  <div
                    key={appointment.id}
                    {...dragProps(appointment)}
                    className={cn(
                      "group p-4 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing transition-all duration-200 hover:shadow-md hover:border-blue-500/40",
                      draggedId === appointment.id && "opacity-40 ring-2 ring-blue-500/50"
                    )}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <GripVertical className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                      <Avatar>
                        <AvatarFallback className="bg-blue-100 text-blue-800">
                          {appointment.patientName.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-foreground">
                          {appointment.patientName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Started: {formatTime(appointment.dateTime)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                      <Stethoscope className="w-4 h-4" />
                      <span>{appointment.doctorName}</span>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      size="sm"
                      onClick={() => handleMarkComplete(appointment.id)}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Mark Complete
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No patients with doctors</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Column */}
        <Card
          className={cn(
            "border-green-500/30 transition-all duration-200 animate-fade-up stagger-3",
            dragOverColumn === "completed" && "ring-2 ring-green-500/60 ring-offset-2 shadow-lg"
          )}
          onDragOver={(e) => handleDragOver(e, "completed")}
          onDrop={(e) => handleDrop(e, "completed")}
        >
          <CardHeader className="bg-green-500/10 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-5 h-5" />
              Completed ({completedPatients.length})
            </CardTitle>
            <CardDescription>
              Today&apos;s completed appointments
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 min-h-[140px]">
            {completedPatients.length > 0 ? (
              <div className="space-y-3">
                {completedPatients.slice(0, 5).map((appointment) => (
                  <div
                    key={appointment.id}
                    {...dragProps(appointment)}
                    className={cn(
                      "group p-4 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing transition-all duration-200 hover:shadow-md hover:border-green-500/40",
                      draggedId === appointment.id && "opacity-40 ring-2 ring-green-500/50"
                    )}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                      <Avatar>
                        <AvatarFallback className="bg-green-100 text-green-800">
                          {appointment.patientName.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-foreground">
                          {appointment.patientName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Completed at {formatTime(appointment.dateTime)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Stethoscope className="w-4 h-4" />
                      <span>{appointment.doctorName}</span>
                    </div>
                  </div>
                ))}
                {completedPatients.length > 5 && (
                  <p className="text-center text-sm text-muted-foreground">
                    +{completedPatients.length - 5} more completed
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No completed appointments yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Move Confirmation Dialog (drag & drop) */}
      <AlertDialog
        open={pendingMove !== null}
        onOpenChange={(open) => { if (!open) setPendingMove(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move patient?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Move <span className="font-semibold text-foreground">{pendingMove?.appointment.patientName}</span> to a new status?
                </p>
                {pendingMove && (
                  <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    <Badge variant="outline">
                      {COLUMN_LABELS[pendingMove.appointment.status as ColumnStatus] ?? pendingMove.appointment.status}
                    </Badge>
                    <MoveRight className="w-4 h-4 text-muted-foreground" />
                    <Badge className="bg-primary text-primary-foreground">
                      {COLUMN_LABELS[pendingMove.target]}
                    </Badge>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMove}>
              <MoveRight className="w-4 h-4 mr-2" />
              Confirm move
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Call Patient Dialog */}
      <AlertDialog open={callDialogOpen} onOpenChange={setCallDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Call Patient</AlertDialogTitle>
            <AlertDialogDescription>
              This will notify {selectedPatient?.patientName} that {selectedPatient?.doctorName} is ready to see them.
              The patient will be moved to &quot;With Doctor&quot; status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCallPatient}>
              <Bell className="w-4 h-4 mr-2" />
              Call Patient
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
