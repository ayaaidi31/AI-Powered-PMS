"use client"

/**
 * Patient appointment list with self-service cancellation (Feature 4 —
 * UC-PAT-03). Cancellation calls `cancelAppointment` with the 24-hour cut-off
 * enforced server-side (REQ-MOD-05); the action also frees the slot for
 * re-booking. Rescheduling reuses the booking wizard in edit mode
 * (`/patient/appointments/new?reschedule=<id>`), which moves the existing
 * appointment in place instead of creating a new one.
 */
import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Calendar, Clock, User, Plus, MoreHorizontal, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { formatDateTime, statusLabel, type AppointmentStatusDb } from "@/lib/display"
import { cancelAppointment } from "@/lib/actions/appointments"

/** Minimal shape the patient list needs (projected by the Server Component). */
export interface PatientAppointmentView {
  id: string
  starts_at: string
  status: AppointmentStatusDb
  reason: string | null
  doctor_name: string
  check_in_code: string | null
}

const STATUS_VARIANT: Record<AppointmentStatusDb, "default" | "secondary" | "outline" | "destructive"> = {
  scheduled: "default",
  waiting: "secondary",
  in_progress: "default",
  completed: "outline",
  cancelled: "destructive",
  no_show: "destructive",
}

export function PatientAppointmentsClient({ appointments }: { appointments: PatientAppointmentView[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [cancelId, setCancelId] = useState<string | null>(null)

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const upcoming = appointments
    .filter((a) => new Date(a.starts_at) >= todayStart && a.status !== "cancelled" && a.status !== "completed")
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))

  const past = appointments
    .filter((a) => new Date(a.starts_at) < todayStart || a.status === "completed" || a.status === "cancelled")
    .sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at))

  /**
   * Mirrors the server-side 24-hour rule so the UI can disable the controls.
   * Reschedule uses the same gate as cancel — a reschedule is a cancel + re-book,
   * so both are blocked inside the 24-hour window (call reception instead).
   */
  const canCancel = (a: PatientAppointmentView) => {
    const hoursUntil = (new Date(a.starts_at).getTime() - Date.now()) / 3_600_000
    return hoursUntil > 24 && a.status === "scheduled"
  }

  function confirmCancel() {
    if (!cancelId) return
    startTransition(async () => {
      const result = await cancelAppointment(cancelId, { enforce24hWindow: true })
      if (result.status === "ok") {
        toast.success("Appointment cancelled.")
        router.refresh()
      } else {
        toast.error(result.message)
      }
      setCancelId(null)
    })
  }

  function AppointmentCard({ appointment }: { appointment: PatientAppointmentView }) {
    const { date, time } = formatDateTime(appointment.starts_at)
    const isUpcoming = new Date(appointment.starts_at) >= todayStart && appointment.status === "scheduled"
    const cancellable = canCancel(appointment)

    return (
      <div className="p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate">{appointment.doctor_name}</h3>
              <p className="text-sm text-muted-foreground truncate">{appointment.reason}</p>
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
              {isUpcoming && appointment.check_in_code && (
                <p className="text-xs text-muted-foreground mt-2">
                  Check-in code:{" "}
                  <span className="font-mono font-semibold tracking-widest text-foreground">
                    {appointment.check_in_code}
                  </span>
                  <span className="block text-[11px] mt-0.5">Scan the clinic QR on arrival and enter this code.</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[appointment.status]}>{statusLabel(appointment.status)}</Badge>
            {isUpcoming && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {cancellable ? (
                    <DropdownMenuItem asChild>
                      <Link href={`/patient/appointments/new?reschedule=${appointment.id}`}>Reschedule</Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem disabled>Cannot reschedule (less than 24h)</DropdownMenuItem>
                  )}
                  {cancellable ? (
                    <DropdownMenuItem className="text-destructive" onClick={() => setCancelId(appointment.id)}>
                      Cancel Appointment
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem disabled>Cannot cancel (less than 24h)</DropdownMenuItem>
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Appointments</h1>
            <p className="text-muted-foreground">Manage your scheduled visits</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/patient/book-voice">
              <Button variant="outline" className="gap-2">
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Book by voice</span>
                <span className="sm:hidden">Voice</span>
              </Button>
            </Link>
            <Link href="/patient/appointments/new">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Book New
              </Button>
            </Link>
          </div>
        </div>

        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Appointments</CardTitle>
                <CardDescription>Your scheduled visits with our healthcare providers</CardDescription>
              </CardHeader>
              <CardContent>
                {upcoming.length > 0 ? (
                  <div className="space-y-4">
                    {upcoming.map((a) => <AppointmentCard key={a.id} appointment={a} />)}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground mb-4">No upcoming appointments</p>
                    <Link href="/patient/appointments/new"><Button>Book an Appointment</Button></Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="past">
            <Card>
              <CardHeader>
                <CardTitle>Past Appointments</CardTitle>
                <CardDescription>Your appointment history</CardDescription>
              </CardHeader>
              <CardContent>
                {past.length > 0 ? (
                  <div className="space-y-4">
                    {past.map((a) => <AppointmentCard key={a.id} appointment={a} />)}
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

      <AlertDialog open={cancelId !== null} onOpenChange={(open) => !open && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this appointment? The time slot will become available
              for other patients.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Keep Appointment</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              disabled={isPending}
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
