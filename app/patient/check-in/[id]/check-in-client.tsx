"use client"

/**
 * Mobile self check-in flow (Feature 5 — UC-PAT-01).
 *
 * Steps: OTP verification (simulated until auth/SMS is wired) → confirm arrival
 * → success. Confirming arrival calls `checkInAppointment` with same-day
 * enforcement (REQ-PAT-02); the action transitions the appointment from
 * `scheduled` to `waiting` and is idempotent against duplicate check-ins
 * (REQ-PAT-05).
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, QrCode, Check, AlertTriangle, Smartphone, Clock, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { toast } from "sonner"
import { checkInAppointment } from "@/lib/actions/appointments"

interface CheckInAppointment {
  id: string
  starts_at: string
  status: string
  reason: string | null
  doctor_name: string
  patient_name: string
}

type CheckInStep = "verify" | "confirm" | "success"

export function CheckInClient({ appointment }: { appointment: CheckInAppointment | null }) {
  const router = useRouter()
  const [step, setStep] = useState<CheckInStep>("verify")
  const [otp, setOtp] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const isToday =
    appointment && new Date(appointment.starts_at).toDateString() === new Date().toDateString()

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })

  async function handleVerifyOTP() {
    if (otp.length !== 4) {
      toast.error("Please enter the 4-digit OTP")
      return
    }
    setIsLoading(true)
    // OTP delivery/verification is simulated until phone-OTP auth is implemented.
    await new Promise((r) => setTimeout(r, 600))
    setStep("confirm")
    setIsLoading(false)
  }

  async function handleCheckIn() {
    if (!appointment) return
    setIsLoading(true)
    const result = await checkInAppointment(appointment.id, { enforceSameDay: true })
    setIsLoading(false)
    if (result.status === "ok") {
      setStep("success")
      toast.success("Check-in successful!")
      router.refresh()
    } else {
      toast.error(result.message)
    }
  }

  if (!appointment) {
    return (
      <CenteredCard
        icon={<AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />}
        title="Appointment Not Found"
        body="We couldn't find this appointment. Please check your booking details."
        onReturn={() => router.push("/patient/dashboard")}
      />
    )
  }

  if (!isToday) {
    return (
      <CenteredCard
        icon={<AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />}
        title="Check-in Not Available"
        body={`Check-in is only available on the day of your appointment. Your appointment is scheduled for ${new Date(
          appointment.starts_at,
        ).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`}
        onReturn={() => router.push("/patient/dashboard")}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
          <div className="h-6 bg-muted flex items-center justify-center">
            <div className="w-16 h-1 bg-foreground/20 rounded-full" />
          </div>

          <header className="h-12 bg-muted border-b border-border flex items-center px-4 relative">
            <button onClick={() => router.push("/patient/dashboard")} className="p-1 hover:bg-accent rounded">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-medium text-foreground">
              {step === "verify" && "Clinic Check-in"}
              {step === "confirm" && "Today's Appointment"}
              {step === "success" && "Check-in Complete"}
            </h1>
          </header>

          <main className="p-6">
            {step === "verify" && (
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-muted border border-border rounded-lg flex items-center justify-center mb-4">
                  <QrCode className="w-10 h-10 text-foreground" />
                </div>
                <div className="w-full bg-muted border border-border rounded-md p-3 mb-4 text-center">
                  <p className="text-sm text-foreground">QR Code Scanned Successfully</p>
                </div>
                <p className="text-xs text-muted-foreground text-center mb-6 leading-relaxed">
                  Enter the 4-digit OTP sent to your phone to verify your appointment.
                </p>
                <InputOTP maxLength={4} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
                <Button className="w-full mt-6" onClick={handleVerifyOTP} disabled={otp.length !== 4 || isLoading}>
                  {isLoading ? "Verifying..." : "Verify & Continue"}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-4 p-2 bg-muted rounded">
                  Demo: Enter any 4 digits (e.g., 1234)
                </p>
              </div>
            )}

            {step === "confirm" && (
              <div className="flex flex-col items-center">
                <h2 className="text-lg font-medium text-foreground text-center mb-6">
                  Welcome to the Clinic, {appointment.patient_name.split(" ")[0]}!
                </h2>
                <div className="w-full border border-border rounded-md p-4 mb-6 bg-card">
                  <div className="flex items-start gap-3 mb-3">
                    <User className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">{appointment.doctor_name}</p>
                      <p className="text-sm text-muted-foreground">{appointment.reason}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <Clock className="w-5 h-5 text-primary" />
                    <p className="text-sm text-foreground">{formatTime(appointment.starts_at)} Today</p>
                  </div>
                  <Badge variant="outline" className="text-xs">Status: Scheduled</Badge>
                </div>
                <Button className="w-full gap-2" onClick={handleCheckIn} disabled={isLoading}>
                  {isLoading ? "Checking in..." : (<><Check className="w-5 h-5" />Confirm Arrival / Check-in</>)}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-4">
                  Press the button to let the staff know you have arrived.
                </p>
              </div>
            )}

            {step === "success" && (
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <Check className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">You&apos;re Checked In!</h2>
                <p className="text-muted-foreground mb-6">
                  Please take a seat in the waiting area. We&apos;ll call you when it&apos;s your turn.
                </p>
                <Badge className="mb-6 text-sm py-1 px-3">Status: Waiting</Badge>
                <Alert>
                  <Smartphone className="w-4 h-4" />
                  <AlertDescription>You&apos;ll receive a notification when it&apos;s your turn.</AlertDescription>
                </Alert>
                <Button variant="outline" className="w-full mt-6" onClick={() => router.push("/patient/dashboard")}>
                  Return to Dashboard
                </Button>
              </div>
            )}
          </main>

          <div className="h-6 flex items-center justify-center">
            <div className="w-20 h-1 bg-foreground/20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Shared full-screen message card for the not-found / wrong-day states. */
function CenteredCard({
  icon, title, body, onReturn,
}: { icon: React.ReactNode; title: string; body: string; onReturn: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          {icon}
          <h2 className="text-xl font-semibold text-foreground mb-2">{title}</h2>
          <p className="text-muted-foreground mb-6">{body}</p>
          <Button onClick={onReturn}>Return to Dashboard</Button>
        </CardContent>
      </Card>
    </div>
  )
}
