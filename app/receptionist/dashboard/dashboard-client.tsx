"use client"

/**
 * Today's schedule list with client-side patient/doctor search and an inline
 * check-in action (`checkInAppointment`). Kept as a small client island so the
 * surrounding dashboard can remain a Server Component.
 */
import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Calendar, Search, ArrowRight, Stethoscope, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { initials, statusLabel, type AppointmentStatusDb } from "@/lib/display"
import { checkInAppointment, cancelAppointment } from "@/lib/actions/appointments"

export interface TodayAppointment {
  id: string
  patientName: string
  doctorId: string
  doctorName: string
  startsAt: string
  checkInAt: string | null
  status: string
  reason: string | null
  durationMin: number
  hasAllergy: boolean
}

const STATUS_STYLE: Record<string, { color: string; text: string; bg: string }> = {
  waiting: { color: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" },
  in_progress: { color: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50" },
  completed: { color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  scheduled: { color: "bg-slate-400", text: "text-slate-600", bg: "bg-slate-50" },
  no_show: { color: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
}
const styleFor = (s: string) => STATUS_STYLE[s] ?? STATUS_STYLE.scheduled

export function DashboardSchedule({ appointments }: { appointments: TodayAppointment[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState("")
  const [cancelTarget, setCancelTarget] = useState<TodayAppointment | null>(null)

  const filtered = appointments
    .filter((a) => `${a.patientName} ${a.doctorName}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })

  function run(action: Promise<{ status: string; message?: string }>, success: string) {
    startTransition(async () => {
      const result = await action
      if (result.status === "ok") { toast.success(success); router.refresh() }
      else toast.error(result.message ?? "Action failed.")
    })
  }

  function confirmCancel() {
    if (!cancelTarget) return
    run(cancelAppointment(cancelTarget.id, { reasonForChange: "Cancelled by reception" }), "Appointment cancelled.")
    setCancelTarget(null)
  }

  return (
    <>
    <Card className="h-full">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" />Today&apos;s Schedule</CardTitle>
            <CardDescription>{filtered.length} appointments</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search patients..." className="pl-9 w-full sm:w-[200px]" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Link href="/receptionist/schedule"><Button variant="outline" size="sm" className="gap-1">View All <ArrowRight className="w-4 h-4" /></Button></Link>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map((a) => {
              const st = styleFor(a.status)
              return (
                <div key={a.id} className={`group flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-md ${a.status === "waiting" ? "border-amber-200 bg-amber-50/50" : a.status === "in_progress" ? "border-blue-200 bg-blue-50/50" : "border-border hover:border-primary/30"}`}>
                  <div className="text-center min-w-[70px]"><p className="font-bold text-foreground">{formatTime(a.startsAt)}</p><p className="text-xs text-muted-foreground">{a.durationMin} min</p></div>
                  <div className={`w-1.5 h-14 rounded-full ${st.color}`} />
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar className="w-10 h-10 border-2 border-background shadow"><AvatarFallback className={`${st.bg} ${st.text} font-semibold text-sm`}>{initials(...a.patientName.split(" ") as [string, string])}</AvatarFallback></Avatar>
                    <div className="min-w-0 flex-1"><p className="font-semibold text-foreground truncate">{a.patientName}</p><p className="text-sm text-muted-foreground truncate">{a.reason}</p></div>
                  </div>
                  <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground"><Stethoscope className="w-4 h-4" /><span className="truncate max-w-[120px]">{a.doctorName}</span></div>
                  <Badge className={`${st.bg} ${st.text} border-0 whitespace-nowrap`}>{statusLabel(a.status as AppointmentStatusDb)}</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="w-4 h-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={isPending || a.status !== "scheduled"} onClick={() => run(checkInAppointment(a.id), "Patient checked in.")}>Check In Patient</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" disabled={isPending} onClick={() => setCancelTarget(a)}>Cancel</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground"><Calendar className="w-16 h-16 mx-auto mb-4 opacity-30" /><p className="font-medium">No appointments found</p></div>
        )}
      </CardContent>
    </Card>

    <AlertDialog open={cancelTarget !== null} onOpenChange={(o) => !o && setCancelTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
          <AlertDialogDescription>
            {cancelTarget && `${cancelTarget.patientName}'s appointment will be cancelled and the slot freed. `}
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
    </>
  )
}
