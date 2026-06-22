"use client"

/**
 * Waiting-room board: three columns (Waiting → With Doctor → Completed). A card
 * can be advanced via its action button or by drag-and-drop, both confirmed
 * before applying. Each move persists through `setAppointmentStatus` and then
 * refreshes from the database.
 */
import { useState, useTransition } from "react"
import {
  Clock, CheckCircle2, User, Stethoscope, AlertCircle, Bell, GripVertical, MoveRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { initials } from "@/lib/display"
import { setAppointmentStatus } from "@/lib/actions/appointments"

export interface WaitingAppointment {
  id: string
  patientId: string
  patientName: string
  doctorName: string
  startsAt: string
  checkInAt: string | null
  status: string
  reason: string | null
  hasAllergy: boolean
}

// Board columns map directly to database appointment statuses.
type ColumnStatus = "waiting" | "in_progress" | "completed"
const COLUMN_LABELS: Record<ColumnStatus, string> = {
  waiting: "Waiting",
  in_progress: "With Doctor",
  completed: "Completed",
}

export function WaitingClient({ appointments }: { appointments: WaitingAppointment[] }) {
  const [isPending, startTransition] = useTransition()
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<ColumnStatus | null>(null)
  const [pendingMove, setPendingMove] = useState<{ appointment: WaitingAppointment; target: ColumnStatus } | null>(null)
  const [callTarget, setCallTarget] = useState<WaitingAppointment | null>(null)

  const waiting = appointments.filter((a) => a.status === "waiting").sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
  const inProgress = appointments.filter((a) => a.status === "in_progress")
  const completed = appointments.filter((a) => a.status === "completed").sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt))

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  const getWaitTime = (iso: string | null) => {
    if (!iso) return "—"
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return "Just now"
    if (mins < 60) return `${mins} min`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  /** Persist a status change, then refresh from the server. */
  function applyStatus(id: string, target: ColumnStatus, message: string) {
    startTransition(async () => {
      const result = await setAppointmentStatus(id, target)
      if (result.status === "ok") toast.success(message)
      else toast.error(result.message)
    })
  }

  // Drag and drop
  const handleDragStart = (e: React.DragEvent, a: WaitingAppointment) => {
    setDraggedId(a.id)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", a.id)
  }
  const handleDrop = (e: React.DragEvent, target: ColumnStatus) => {
    e.preventDefault()
    const id = draggedId ?? e.dataTransfer.getData("text/plain")
    setDragOverColumn(null); setDraggedId(null)
    const appointment = appointments.find((a) => a.id === id)
    if (!appointment || appointment.status === target) return
    setPendingMove({ appointment, target })
  }
  const dragProps = (a: WaitingAppointment) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => handleDragStart(e, a),
    onDragEnd: () => { setDraggedId(null); setDragOverColumn(null) },
  })

  function confirmMove() {
    if (!pendingMove) return
    const { appointment, target } = pendingMove
    applyStatus(appointment.id, target, `${appointment.patientName} moved to "${COLUMN_LABELS[target]}"`)
    setPendingMove(null)
  }

  function confirmCall() {
    if (!callTarget) return
    applyStatus(callTarget.id, "in_progress", `${callTarget.patientName} has been called to ${callTarget.doctorName}'s office`)
    setCallTarget(null)
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Waiting Room</h1>
          <p className="text-muted-foreground">Manage patient flow and waiting times</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <GripVertical className="w-3.5 h-3.5" />
            Drag a card to another column to move a patient
          </span>
          <Badge variant="outline" className="text-sm py-1 px-3">
            <Clock className="w-4 h-4 mr-2" />
            {waiting.length} Waiting
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 min-w-0 lg:grid-cols-3 gap-6">
        {/* Waiting */}
        <Column color="yellow" title={`Waiting (${waiting.length})`} description="Patients waiting to be seen"
          icon={<Clock className="w-5 h-5" />}
          isOver={dragOverColumn === "waiting"}
          onDragOver={(e) => { e.preventDefault(); setDragOverColumn("waiting") }}
          onDrop={(e) => handleDrop(e, "waiting")}
          empty={waiting.length === 0}
          emptyIcon={<Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />}
          emptyText="No patients waiting"
        >
          {waiting.map((a, index) => (
            <div key={a.id} {...dragProps(a)} className={cn("group p-4 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing transition-all hover:shadow-md hover:border-yellow-500/40", draggedId === a.id && "opacity-40 ring-2 ring-yellow-500/50")}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <GripVertical className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground" />
                  <div className="relative">
                    <Avatar><AvatarFallback className="bg-yellow-100 text-yellow-800">{initials(...a.patientName.split(" ") as [string, string])}</AvatarFallback></Avatar>
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 text-white text-xs rounded-full flex items-center justify-center font-bold">{index + 1}</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{a.patientName}</p>
                    <p className="text-xs text-muted-foreground">Waiting: {getWaitTime(a.checkInAt)}</p>
                  </div>
                </div>
                {a.hasAllergy && <Badge variant="destructive" className="text-xs"><AlertCircle className="w-3 h-3 mr-1" />Allergy</Badge>}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3"><Stethoscope className="w-4 h-4" /><span>{a.doctorName}</span></div>
              {a.reason && <p className="text-sm text-muted-foreground mb-3">{a.reason}</p>}
              <Button className="w-full gap-2" size="sm" onClick={() => setCallTarget(a)} disabled={isPending}><Bell className="w-4 h-4" />Call Patient</Button>
            </div>
          ))}
        </Column>

        {/* In Progress */}
        <Column color="blue" title={`With Doctor (${inProgress.length})`} description="Patients currently being seen"
          icon={<User className="w-5 h-5" />}
          isOver={dragOverColumn === "in_progress"}
          onDragOver={(e) => { e.preventDefault(); setDragOverColumn("in_progress") }}
          onDrop={(e) => handleDrop(e, "in_progress")}
          empty={inProgress.length === 0}
          emptyIcon={<User className="w-12 h-12 mx-auto mb-4 opacity-50" />}
          emptyText="No patients with doctors"
        >
          {inProgress.map((a) => (
            <div key={a.id} {...dragProps(a)} className={cn("group p-4 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing transition-all hover:shadow-md hover:border-blue-500/40", draggedId === a.id && "opacity-40 ring-2 ring-blue-500/50")}>
              <div className="flex items-center gap-3 mb-3">
                <GripVertical className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground" />
                <Avatar><AvatarFallback className="bg-blue-100 text-blue-800">{initials(...a.patientName.split(" ") as [string, string])}</AvatarFallback></Avatar>
                <div>
                  <p className="font-medium text-foreground">{a.patientName}</p>
                  <p className="text-xs text-muted-foreground">Started: {formatTime(a.startsAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3"><Stethoscope className="w-4 h-4" /><span>{a.doctorName}</span></div>
              <Button variant="outline" className="w-full gap-2" size="sm" onClick={() => applyStatus(a.id, "completed", "Appointment marked as completed")} disabled={isPending}><CheckCircle2 className="w-4 h-4" />Mark Complete</Button>
            </div>
          ))}
        </Column>

        {/* Completed */}
        <Column color="green" title={`Completed (${completed.length})`} description="Today's completed appointments"
          icon={<CheckCircle2 className="w-5 h-5" />}
          isOver={dragOverColumn === "completed"}
          onDragOver={(e) => { e.preventDefault(); setDragOverColumn("completed") }}
          onDrop={(e) => handleDrop(e, "completed")}
          empty={completed.length === 0}
          emptyIcon={<CheckCircle2 className="w-12 h-12 mx-auto mb-4 opacity-50" />}
          emptyText="No completed appointments yet"
        >
          {completed.slice(0, 5).map((a) => (
            <div key={a.id} {...dragProps(a)} className={cn("group p-4 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing transition-all hover:shadow-md hover:border-green-500/40", draggedId === a.id && "opacity-40 ring-2 ring-green-500/50")}>
              <div className="flex items-center gap-3 mb-2">
                <GripVertical className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground" />
                <Avatar><AvatarFallback className="bg-green-100 text-green-800">{initials(...a.patientName.split(" ") as [string, string])}</AvatarFallback></Avatar>
                <div>
                  <p className="font-medium text-foreground">{a.patientName}</p>
                  <p className="text-xs text-muted-foreground">Completed at {formatTime(a.startsAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Stethoscope className="w-4 h-4" /><span>{a.doctorName}</span></div>
            </div>
          ))}
          {completed.length > 5 && <p className="text-center text-sm text-muted-foreground">+{completed.length - 5} more completed</p>}
        </Column>
      </div>

      {/* Move confirmation */}
      <AlertDialog open={pendingMove !== null} onOpenChange={(open) => { if (!open) setPendingMove(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move patient?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Move <span className="font-semibold text-foreground">{pendingMove?.appointment.patientName}</span> to a new status?</p>
                {pendingMove && (
                  <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    <Badge variant="outline">{COLUMN_LABELS[pendingMove.appointment.status as ColumnStatus] ?? pendingMove.appointment.status}</Badge>
                    <MoveRight className="w-4 h-4 text-muted-foreground" />
                    <Badge className="bg-primary text-primary-foreground">{COLUMN_LABELS[pendingMove.target]}</Badge>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMove} disabled={isPending}><MoveRight className="w-4 h-4 mr-2" />Confirm move</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Call patient */}
      <AlertDialog open={callTarget !== null} onOpenChange={(open) => { if (!open) setCallTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Call Patient</AlertDialogTitle>
            <AlertDialogDescription>
              This will notify {callTarget?.patientName} that {callTarget?.doctorName} is ready to see them.
              The patient will be moved to &quot;With Doctor&quot; status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCall} disabled={isPending}><Bell className="w-4 h-4 mr-2" />Call Patient</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Column shell with coloured header and empty state. */
function Column({
  color, title, description, icon, isOver, onDragOver, onDrop, empty, emptyIcon, emptyText, children,
}: {
  color: "yellow" | "blue" | "green"
  title: string; description: string; icon: React.ReactNode
  isOver: boolean; onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void
  empty: boolean; emptyIcon: React.ReactNode; emptyText: string; children: React.ReactNode
}) {
  const ring = { yellow: "ring-yellow-500/60", blue: "ring-blue-500/60", green: "ring-green-500/60" }[color]
  const border = { yellow: "border-yellow-500/30", blue: "border-blue-500/30", green: "border-green-500/30" }[color]
  const headerBg = { yellow: "bg-yellow-500/10 text-yellow-700", blue: "bg-blue-500/10 text-blue-700", green: "bg-green-500/10 text-green-700" }[color]
  return (
    <Card className={cn(border, "transition-all", isOver && `ring-2 ${ring} ring-offset-2 shadow-lg`)} onDragOver={onDragOver} onDrop={onDrop}>
      <CardHeader className={cn("rounded-t-lg", headerBg)}>
        <CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 min-h-[140px]">
        {empty ? (
          <div className="text-center py-8 text-muted-foreground">{emptyIcon}<p>{emptyText}</p></div>
        ) : (
          <div className="space-y-3">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}
