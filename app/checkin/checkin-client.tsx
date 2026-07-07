"use client"

/**
 * Clinic self check-in flow (Feature 3 — UC-PAT-01), reached from the static
 * clinic QR code. Two paths:
 *   - Confirm: a signed-in patient with a scheduled visit today taps to confirm
 *     arrival (`checkInAppointment`).
 *   - Code: anyone else enters the short code issued at booking (`checkInByCode`).
 * Both transition the appointment to `waiting`, same-day enforced server-side.
 */
import { useState } from "react"
import Link from "next/link"
import { QrCode, Check, Clock, User, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { checkInAppointment, checkInByCode } from "@/lib/actions/appointments"

export interface TodayAppointment {
  id: string
  starts_at: string
  status: string
  reason: string | null
  doctor_name: string
}

interface CheckedIn {
  doctor_name: string
  starts_at: string
  patient_name?: string
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

export function ClinicCheckInClient({
  loggedIn,
  firstName,
  appointments,
}: {
  loggedIn: boolean
  firstName: string | null
  appointments: TodayAppointment[]
}) {
  const hasToday = appointments.length > 0
  const [mode, setMode] = useState<"confirm" | "code">(hasToday ? "confirm" : "code")
  const [checkedIn, setCheckedIn] = useState<CheckedIn | null>(null)
  const [code, setCode] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function confirmArrival(appt: TodayAppointment) {
    setBusyId(appt.id)
    const result = await checkInAppointment(appt.id, { enforceSameDay: true })
    setBusyId(null)
    if (result.status === "ok") {
      setCheckedIn({ doctor_name: appt.doctor_name, starts_at: appt.starts_at })
    } else {
      toast.error(result.message)
    }
  }

  async function submitCode() {
    if (!code.trim()) {
      toast.error("Please enter your check-in code.")
      return
    }
    setSubmitting(true)
    const result = await checkInByCode(code)
    setSubmitting(false)
    if (result.status === "ok") {
      setCheckedIn({
        doctor_name: result.data.doctor_name,
        starts_at: result.data.starts_at,
        patient_name: result.data.patient_name,
      })
    } else {
      toast.error(result.message)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <QrCode className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Clinic Check-in</h1>
          <p className="text-sm text-muted-foreground">Let the front desk know you have arrived.</p>
        </div>

        {/* Success */}
        {checkedIn ? (
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <Check className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-1">
                You&apos;re checked in{checkedIn.patient_name ? `, ${checkedIn.patient_name.split(" ")[0]}` : ""}!
              </h2>
              <p className="text-muted-foreground mb-4">
                Please take a seat in the waiting area — we&apos;ll call you when it&apos;s your turn.
              </p>
              <div className="w-full border border-border rounded-lg p-4 text-left space-y-2">
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-primary" />
                  <span className="text-sm text-foreground">{checkedIn.doctor_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-sm text-foreground">{formatTime(checkedIn.starts_at)} today</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : mode === "confirm" && hasToday ? (
          /* Session path — confirm arrival */
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Welcome{firstName ? `, ${firstName}` : ""}!
              </CardTitle>
              <CardDescription>
                {appointments.length > 1
                  ? "You have more than one appointment today — confirm the one you're here for."
                  : "Confirm your appointment below to check in."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {appointments.map((appt) => {
                const alreadyIn = appt.status === "waiting"
                return (
                  <div key={appt.id} className="border border-border rounded-lg p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <User className="w-5 h-5 text-primary mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{appt.doctor_name}</p>
                        {appt.reason && <p className="text-sm text-muted-foreground">{appt.reason}</p>}
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {formatTime(appt.starts_at)} today
                        </p>
                      </div>
                    </div>
                    {alreadyIn ? (
                      <Badge variant="secondary" className="gap-1"><Check className="w-3 h-3" /> Already checked in</Badge>
                    ) : (
                      <Button
                        className="w-full gap-2"
                        onClick={() => confirmArrival(appt)}
                        disabled={busyId === appt.id}
                      >
                        {busyId === appt.id ? "Checking in…" : (<><Check className="w-4 h-4" /> Confirm arrival</>)}
                      </Button>
                    )}
                  </div>
                )
              })}
              <button
                onClick={() => setMode("code")}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 pt-1"
              >
                Not you, or here for a different visit? Enter a code instead
              </button>
            </CardContent>
          </Card>
        ) : (
          /* Code path */
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" /> Enter your check-in code
              </CardTitle>
              <CardDescription>
                Use the 6-character code from your booking confirmation email.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. K7P2X9"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={8}
                className="text-center text-2xl font-mono tracking-[0.4em] h-14"
                onKeyDown={(e) => e.key === "Enter" && submitCode()}
              />
              <Button className="w-full" onClick={submitCode} disabled={submitting || !code.trim()}>
                {submitting ? "Checking in…" : "Check in"}
              </Button>
              {hasToday && (
                <button
                  onClick={() => setMode("confirm")}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  Back to my appointment
                </button>
              )}
              {!loggedIn && (
                <p className="text-xs text-muted-foreground text-center">
                  Have an account?{" "}
                  <Link href="/" className="underline underline-offset-4">Sign in</Link>{" "}
                  to check in without a code.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
