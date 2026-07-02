"use client"

/**
 * Interactive weekly schedule (Features 4/7/9).
 *
 * Reads the appointment list supplied by the Server Component and drives:
 *  - booking (UC-PAT-02 logic reused for staff) via `bookAppointment`, which
 *    enforces the double-booking guard server-side (REQ-SCHED-03);
 *  - manual check-in (UC-REC-02) via `checkInAppointment`;
 *  - staff cancellation (UC-REC-04) via `cancelAppointment`.
 *
 * Each mutation refreshes the parent Server Component so the grid reflects the
 * authoritative database state.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, Plus, Filter, MoreVertical,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import type { DoctorRow, PatientRow } from "@/lib/seed-data"
import { patientName, doctorName, statusColor, statusLabel, bookingSource } from "@/lib/display"
import type { AppointmentWithNames } from "@/lib/queries"
import { bookAppointment, checkInAppointment, cancelAppointment, rescheduleAppointment, revertCheckIn, reassignAppointment, deleteAppointment } from "@/lib/actions/appointments"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"

const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00",
]

interface Props {
  appointments: AppointmentWithNames[]
  doctors: DoctorRow[]
  patients: PatientRow[]
}

export function ScheduleClient({ appointments, doctors, patients }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDoctor, setSelectedDoctor] = useState<string>("all")
  const [isBookingOpen, setIsBookingOpen] = useState(false)
  const [form, setForm] = useState({ patientId: "", doctorId: "", date: "", time: "", reason: "" })
  const [cancelTarget, setCancelTarget] = useState<AppointmentWithNames | null>(null)
  const [checkInTarget, setCheckInTarget] = useState<AppointmentWithNames | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentWithNames | null>(null)
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", time: "" })
  const [reassignTarget, setReassignTarget] = useState<AppointmentWithNames | null>(null)
  const [reassignDoctorId, setReassignDoctorId] = useState("")
  const [deleteApptTarget, setDeleteApptTarget] = useState<AppointmentWithNames | null>(null)
  // Mobile agenda: the single day shown in the phone (list) view.
  const [mobileDate, setMobileDate] = useState(new Date())

  function getWeekDates() {
    const dates: Date[] = []
    const start = new Date(currentDate)
    // Monday of the current week (correct even on Sunday, where getDay() === 0).
    start.setDate(currentDate.getDate() - ((currentDate.getDay() + 6) % 7))
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      dates.push(d)
    }
    return dates
  }
  const weekDates = getWeekDates()

  function appointmentsForSlot(date: Date, time: string) {
    return appointments.filter((apt) => {
      const d = new Date(apt.starts_at)
      const sameDay = d.toDateString() === date.toDateString()
      const sameTime = d.toTimeString().slice(0, 5) === time
      const matchesDoctor = selectedDoctor === "all" || apt.doctor_id === selectedDoctor
      return sameDay && sameTime && matchesDoctor && apt.status !== "cancelled"
    })
  }

  const shiftWeek = (days: number) => {
    const d = new Date(currentDate)
    d.setDate(currentDate.getDate() + days)
    setCurrentDate(d)
    const m = new Date(mobileDate)
    m.setDate(mobileDate.getDate() + days)
    setMobileDate(m)
  }
  const goToday = () => { setCurrentDate(new Date()); setMobileDate(new Date()) }
  const isToday = (date: Date) => date.toDateString() === new Date().toDateString()
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

  /** All appointments for one day (mobile agenda), sorted by start time. */
  function appointmentsForDay(date: Date) {
    return appointments
      .filter((apt) => {
        const d = new Date(apt.starts_at)
        const matchesDoctor = selectedDoctor === "all" || apt.doctor_id === selectedDoctor
        return d.toDateString() === date.toDateString() && matchesDoctor && apt.status !== "cancelled"
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  }

  function handleBook() {
    if (!form.patientId || !form.doctorId || !form.date || !form.time) {
      toast.error("Please select a patient, doctor, date and time.")
      return
    }
    // Combine the date and time into an absolute instant for the server.
    const startsAt = new Date(`${form.date}T${form.time}:00`).toISOString()
    startTransition(async () => {
      const result = await bookAppointment({
        patient_id: form.patientId, doctor_id: form.doctorId,
        starts_at: startsAt, duration_min: 30, reason: form.reason, source: "manual",
      })
      if (result.status === "ok") {
        toast.success("Appointment booked.")
        setIsBookingOpen(false)
        setForm({ patientId: "", doctorId: "", date: "", time: "", reason: "" })
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })
  }

  function confirmCheckIn() {
    if (!checkInTarget) return
    startTransition(async () => {
      const result = await checkInAppointment(checkInTarget.id)
      if (result.status === "ok") {
        toast.success("Patient checked in.")
        router.refresh()
      } else {
        toast.error(result.message)
      }
      setCheckInTarget(null)
    })
  }

  function undoCheckIn(apt: AppointmentWithNames) {
    startTransition(async () => {
      const result = await revertCheckIn(apt.id)
      if (result.status === "ok") {
        toast.success("Check-in undone — appointment back to scheduled.")
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })
  }

  function confirmDeleteAppt(reason: string) {
    if (!deleteApptTarget) return
    const t = deleteApptTarget
    startTransition(async () => {
      const result = await deleteAppointment(t.id, reason)
      if (result.status === "ok") {
        toast.success("Appointment deleted.")
        router.refresh()
        setDeleteApptTarget(null)
      } else {
        toast.error(result.message)
      }
    })
  }

  function openReassign(apt: AppointmentWithNames) {
    setReassignDoctorId(apt.doctor_id)
    setReassignTarget(apt)
  }

  function confirmReassign() {
    if (!reassignTarget) return
    if (!reassignDoctorId) { toast.error("Pick a doctor."); return }
    if (reassignDoctorId === reassignTarget.doctor_id) { setReassignTarget(null); return }
    startTransition(async () => {
      const result = await reassignAppointment(reassignTarget.id, reassignDoctorId, { reasonForChange: "Reassigned by reception" })
      if (result.status === "ok") {
        toast.success("Appointment reassigned.")
        router.refresh()
        setReassignTarget(null)
      } else {
        toast.error(result.message)
      }
    })
  }

  function openReschedule(apt: AppointmentWithNames) {
    const d = new Date(apt.starts_at)
    setRescheduleForm({ date: toYMD(d), time: d.toTimeString().slice(0, 5) })
    setRescheduleTarget(apt)
  }

  function confirmReschedule() {
    if (!rescheduleTarget) return
    if (!rescheduleForm.date || !rescheduleForm.time) { toast.error("Pick a date and time."); return }
    const startsAt = new Date(`${rescheduleForm.date}T${rescheduleForm.time}:00`).toISOString()
    startTransition(async () => {
      const result = await rescheduleAppointment(rescheduleTarget.id, startsAt, { reasonForChange: "Rescheduled by reception" })
      if (result.status === "ok") {
        toast.success("Appointment rescheduled.")
        router.refresh()
        setRescheduleTarget(null)
      } else {
        toast.error(result.message)
      }
    })
  }

  // Local YYYY-MM-DD (avoids the UTC shift toISOString would introduce).
  const toYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  /** Open the booking dialog pre-filled with the clicked calendar slot. */
  function openBookingAt(date: Date, time: string) {
    setForm({ patientId: "", doctorId: "", date: toYMD(date), time, reason: "" })
    setIsBookingOpen(true)
  }

  function confirmCancel() {
    if (!cancelTarget) return
    startTransition(async () => {
      const result = await cancelAppointment(cancelTarget.id, { reasonForChange: "Cancelled by reception" })
      if (result.status === "ok") {
        toast.success("Appointment cancelled.")
        router.refresh()
      } else {
        toast.error(result.message)
      }
      setCancelTarget(null)
    })
  }

  // Shared action menu for an appointment (used by both the week grid and the
  // mobile agenda) so the two views stay behaviourally identical.
  const apptMenuItems = (apt: AppointmentWithNames) => (
    <>
      {apt.status === "scheduled" && (
        <DropdownMenuItem onClick={() => setCheckInTarget(apt)} disabled={isPending}>Check In Patient</DropdownMenuItem>
      )}
      {apt.status === "waiting" && (
        <DropdownMenuItem onClick={() => undoCheckIn(apt)} disabled={isPending}>Undo Check-in</DropdownMenuItem>
      )}
      {(apt.status === "scheduled" || apt.status === "waiting") && (
        <DropdownMenuItem onClick={() => openReschedule(apt)} disabled={isPending}>Reschedule</DropdownMenuItem>
      )}
      {(apt.status === "scheduled" || apt.status === "waiting") && (
        <DropdownMenuItem onClick={() => openReassign(apt)} disabled={isPending}>Reassign doctor</DropdownMenuItem>
      )}
      {apt.status === "scheduled" && (
        <DropdownMenuItem className="text-destructive" onClick={() => setCancelTarget(apt)} disabled={isPending}>Cancel</DropdownMenuItem>
      )}
      {(apt.status === "scheduled" || apt.status === "cancelled" || apt.status === "no_show") && (
        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteApptTarget(apt)} disabled={isPending}>Delete (mistake)</DropdownMenuItem>
      )}
      {apt.status !== "scheduled" && apt.status !== "waiting" && apt.status !== "cancelled" && apt.status !== "no_show" && (
        <DropdownMenuItem disabled>No actions available</DropdownMenuItem>
      )}
    </>
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Schedule</h1>
          <p className="text-muted-foreground">Manage appointments and schedules</p>
        </div>
        <Dialog open={isBookingOpen} onOpenChange={setIsBookingOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={() => setForm({ patientId: "", doctorId: "", date: "", time: "", reason: "" })}>
              <Plus className="w-4 h-4" />
              Book Appointment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Book New Appointment</DialogTitle>
              <DialogDescription>
                {form.date && form.time
                  ? `New appointment on ${new Date(`${form.date}T00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at ${form.time}`
                  : "Schedule a new appointment for a patient"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Select value={form.patientId} onValueChange={(v) => setForm({ ...form, patientId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{patientName(p)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Doctor</Label>
                <Select value={form.doctorId} onValueChange={(v) => setForm({ ...form, doctorId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                  <SelectContent>
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{doctorName(d)} — {d.department}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Select value={form.time} onValueChange={(v) => setForm({ ...form, time: v })}>
                    <SelectTrigger><SelectValue placeholder="Time" /></SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason for Visit</Label>
                <Textarea
                  placeholder="Brief description of the visit reason..."
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </div>
              <Button className="w-full" onClick={handleBook} disabled={isPending}>
                {isPending ? "Booking…" : "Book Appointment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Controls */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => shiftWeek(-7)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={goToday}>Today</Button>
              <Button variant="outline" size="icon" onClick={() => shiftWeek(7)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="ml-2 font-medium text-foreground text-sm sm:text-base">
                {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {weekDates[4].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Filter by doctor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Doctors</SelectItem>
                  {doctors.map((d) => <SelectItem key={d.id} value={d.id}>{doctorName(d)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Grid — full week (desktop / tablet) */}
      <Card className="hidden lg:block">
        <CardContent className="pt-4 overflow-x-auto">
          <div className="min-w-[1100px]">
            <div className="grid grid-cols-8 gap-2 mb-4">
              <div className="w-16" />
              {weekDates.map((date, idx) => (
                <div key={idx} className={`text-center p-3 rounded-lg ${isToday(date) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <p className="text-sm font-medium">{date.toLocaleDateString("en-US", { weekday: "short" })}</p>
                  <p className="text-lg font-bold">{date.getDate()}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              {TIME_SLOTS.map((time) => (
                <div key={time} className="grid grid-cols-8 gap-2">
                  <div className="w-16 text-sm text-muted-foreground text-right pr-2 py-3">{time}</div>
                  {weekDates.map((date, dayIdx) => {
                    const slotAppointments = appointmentsForSlot(date, time)
                    return (
                      <div
                        key={dayIdx}
                        onClick={() => openBookingAt(date, time)}
                        title={`Book on ${date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })} at ${time}`}
                        className="group relative min-h-[60px] border border-border rounded-lg p-1 bg-card hover:bg-accent/40 hover:border-primary/40 transition-colors cursor-pointer"
                      >
                        {slotAppointments.length === 0 && (
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                            <Plus className="w-4 h-4" />
                          </span>
                        )}
                        {slotAppointments.map((apt) => (
                          <DropdownMenu key={apt.id}>
                            <DropdownMenuTrigger asChild>
                              <button onClick={(e) => e.stopPropagation()} className={`w-full text-left p-2 rounded text-xs text-white ${statusColor(apt.status)} hover:opacity-90`}>
                                <p className="font-medium truncate">{apt.patient_name}</p>
                                <p className="opacity-80 truncate">{apt.doctor_name}</p>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                              {apptMenuItems(apt)}
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

      {/* Mobile agenda — one day as a list (phones) */}
      <Card className="lg:hidden">
        <CardContent className="pt-4">
          {/* Day picker */}
          <div className="grid grid-cols-7 gap-1 mb-4">
            {weekDates.map((date, idx) => {
              const selected = isSameDay(date, mobileDate)
              return (
                <button
                  key={idx}
                  onClick={() => setMobileDate(date)}
                  className={`flex flex-col items-center py-2 rounded-lg border text-center transition-colors ${
                    selected
                      ? "bg-primary text-primary-foreground border-primary"
                      : isToday(date)
                        ? "border-primary/50 text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <span className="text-[10px] uppercase">{date.toLocaleDateString("en-US", { weekday: "narrow" })}</span>
                  <span className="text-sm font-bold">{date.getDate()}</span>
                </button>
              )
            })}
          </div>

          {/* Selected day heading + quick book */}
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-foreground">
              {mobileDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </p>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => openBookingAt(mobileDate, "09:00")}>
              <Plus className="w-3.5 h-3.5" /> Book
            </Button>
          </div>

          {/* Appointment list for the selected day */}
          {(() => {
            const dayAppts = appointmentsForDay(mobileDate)
            if (dayAppts.length === 0) {
              return <p className="text-sm text-muted-foreground py-10 text-center">No appointments this day.</p>
            }
            return (
              <div className="space-y-2">
                {dayAppts.map((apt) => (
                  <div key={apt.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <div className="text-center shrink-0 w-12">
                      <p className="text-sm font-bold text-foreground">{new Date(apt.starts_at).toTimeString().slice(0, 5)}</p>
                      <p className="text-[10px] text-muted-foreground">{apt.duration_min}m</p>
                    </div>
                    <span className={`w-1.5 self-stretch rounded-full ${statusColor(apt.status)}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{apt.patient_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{apt.doctor_name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{statusLabel(apt.status)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${bookingSource(apt.source).className}`}>{bookingSource(apt.source).label}</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="shrink-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">{apptMenuItems(apt)}</DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4">
        {[
          ["bg-primary", "Scheduled"], ["bg-yellow-500", "Waiting"], ["bg-blue-500", "In Progress"],
          ["bg-green-500", "Completed"], ["bg-red-500", "Cancelled"],
        ].map(([color, label]) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${color}`} />
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* Cancellation confirmation — cancelling cannot be undone. */}
      <AlertDialog open={cancelTarget !== null} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget && `${cancelTarget.patient_name}'s appointment with ${cancelTarget.doctor_name} will be cancelled and the time slot freed. `}
              This cannot be undone. (Only appointments before check-in can be cancelled.)
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

      {/* Check-in confirmation (avoid accidental check-ins). */}
      <AlertDialog open={checkInTarget !== null} onOpenChange={(o) => !o && setCheckInTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Check in this patient?</AlertDialogTitle>
            <AlertDialogDescription>
              {checkInTarget && `${checkInTarget.patient_name} will be marked as checked in (waiting) for ${checkInTarget.doctor_name} and will appear in the doctor's workspace.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCheckIn} disabled={isPending}>Check In</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reschedule — change the date/time of an appointment. */}
      <Dialog open={rescheduleTarget !== null} onOpenChange={(o) => !o && setRescheduleTarget(null)}>
        <DialogContent className="max-w-md">
          {rescheduleTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reschedule appointment</DialogTitle>
                <DialogDescription>{rescheduleTarget.patient_name} · {rescheduleTarget.doctor_name}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>New date</Label>
                    <Input type="date" value={rescheduleForm.date} onChange={(e) => setRescheduleForm({ ...rescheduleForm, date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>New time</Label>
                    <Select value={rescheduleForm.time} onValueChange={(v) => setRescheduleForm({ ...rescheduleForm, time: v })}>
                      <SelectTrigger><SelectValue placeholder="Time" /></SelectTrigger>
                      <SelectContent>{TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full" onClick={confirmReschedule} disabled={isPending}>
                  {isPending ? "Saving…" : "Save new time"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reassign — move an appointment to a different doctor. */}
      <Dialog open={reassignTarget !== null} onOpenChange={(o) => !o && setReassignTarget(null)}>
        <DialogContent className="max-w-md">
          {reassignTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reassign to another doctor</DialogTitle>
                <DialogDescription>
                  {reassignTarget.patient_name} · {new Date(reassignTarget.starts_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Doctor</Label>
                  <Select value={reassignDoctorId} onValueChange={setReassignDoctorId}>
                    <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                    <SelectContent>
                      {doctors.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {doctorName(d)}{d.is_available ? "" : " (off duty)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={confirmReassign} disabled={isPending}>
                  {isPending ? "Saving…" : "Reassign"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {deleteApptTarget && (
        <ConfirmDeleteDialog
          open
          onOpenChange={(o) => !o && setDeleteApptTarget(null)}
          title="Delete appointment"
          description={`${deleteApptTarget.patient_name} · ${new Date(deleteApptTarget.starts_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}`}
          consequence="Only for mistaken entries (wrong patient, duplicate, never happened). The appointment is permanently removed. Appointments with a report or invoice cannot be deleted — cancel them instead."
          confirmPhrase="DELETE"
          confirmLabel="Delete permanently"
          pending={isPending}
          onConfirm={confirmDeleteAppt}
        />
      )}
    </div>
  )
}
