"use client"

import { useState } from "react"
import Link from "next/link"
import { Calendar, Clock, User, Plus, MoreHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { mockAppointments, currentUser } from "@/lib/mock-data"
import { toast } from "sonner"
import type { AppointmentStatus } from "@/lib/types"

export default function PatientAppointmentsPage() {
  const patient = currentUser.patient
  const [appointments, setAppointments] = useState(
    mockAppointments.filter(apt => apt.patientId === patient.id)
  )
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<string | null>(null)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const upcomingAppointments = appointments
    .filter(apt => new Date(apt.dateTime) >= today && apt.status !== "cancelled")
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())

  const pastAppointments = appointments
    .filter(apt => new Date(apt.dateTime) < today || apt.status === "completed" || apt.status === "cancelled")
    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime())

  const formatDateTime = (date: Date) => {
    const d = new Date(date)
    return {
      date: d.toLocaleDateString("en-US", { 
        weekday: "short", 
        month: "short", 
        day: "numeric",
        year: "numeric"
      }),
      time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    }
  }

  const getStatusBadge = (status: AppointmentStatus) => {
    const variants: Record<AppointmentStatus, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      scheduled: { variant: "default", label: "Scheduled" },
      waiting: { variant: "secondary", label: "Waiting" },
      "in-progress": { variant: "default", label: "In Progress" },
      completed: { variant: "outline", label: "Completed" },
      cancelled: { variant: "destructive", label: "Cancelled" },
      "no-show": { variant: "destructive", label: "No Show" },
    }
    const { variant, label } = variants[status]
    return <Badge variant={variant}>{label}</Badge>
  }

  const canCancel = (appointment: typeof appointments[0]) => {
    const aptDate = new Date(appointment.dateTime)
    const now = new Date()
    const hoursUntil = (aptDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    return hoursUntil > 24 && appointment.status === "scheduled"
  }

  const handleCancelAppointment = () => {
    if (!selectedAppointment) return
    
    setAppointments(prev => 
      prev.map(apt => 
        apt.id === selectedAppointment 
          ? { ...apt, status: "cancelled" as AppointmentStatus }
          : apt
      )
    )
    toast.success("Appointment cancelled successfully")
    setCancelDialogOpen(false)
    setSelectedAppointment(null)
  }

  const AppointmentCard = ({ appointment }: { appointment: typeof appointments[0] }) => {
    const { date, time } = formatDateTime(appointment.dateTime)
    const isUpcoming = new Date(appointment.dateTime) >= today && appointment.status === "scheduled"
    const isCancellable = canCancel(appointment)

    return (
      <div className="p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate">
                {appointment.doctorName}
              </h3>
              <p className="text-sm text-muted-foreground truncate">
                {appointment.reason}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs gap-1">
                  <Calendar className="w-3 h-3" />
                  {date}
                </Badge>
                <Badge variant="outline" className="text-xs gap-1">
                  <Clock className="w-3 h-3" />
                  {time}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(appointment.status)}
            {isUpcoming && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/patient/appointments/${appointment.id}/reschedule`}>
                      Reschedule
                    </Link>
                  </DropdownMenuItem>
                  {isCancellable ? (
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        setSelectedAppointment(appointment.id)
                        setCancelDialogOpen(true)
                      }}
                    >
                      Cancel Appointment
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem disabled>
                      Cannot cancel (less than 24h)
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Appointments</h1>
            <p className="text-muted-foreground">Manage your scheduled visits</p>
          </div>
          <Link href="/patient/appointments/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Book New
            </Button>
          </Link>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList>
            <TabsTrigger value="upcoming">
              Upcoming ({upcomingAppointments.length})
            </TabsTrigger>
            <TabsTrigger value="past">
              Past ({pastAppointments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Appointments</CardTitle>
                <CardDescription>
                  Your scheduled visits with our healthcare providers
                </CardDescription>
              </CardHeader>
              <CardContent>
                {upcomingAppointments.length > 0 ? (
                  <div className="space-y-4">
                    {upcomingAppointments.map(appointment => (
                      <AppointmentCard key={appointment.id} appointment={appointment} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground mb-4">No upcoming appointments</p>
                    <Link href="/patient/appointments/new">
                      <Button>Book an Appointment</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="past">
            <Card>
              <CardHeader>
                <CardTitle>Past Appointments</CardTitle>
                <CardDescription>
                  Your appointment history
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pastAppointments.length > 0 ? (
                  <div className="space-y-4">
                    {pastAppointments.map(appointment => (
                      <AppointmentCard key={appointment.id} appointment={appointment} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No past appointments</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this appointment? This action cannot be undone.
              The time slot will become available for other patients.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelAppointment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
