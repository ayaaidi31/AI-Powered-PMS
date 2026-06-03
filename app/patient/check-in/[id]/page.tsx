"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, QrCode, Check, AlertTriangle, Smartphone, Clock, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { mockAppointments, currentUser } from "@/lib/mock-data"
import { toast } from "sonner"

type CheckInStep = "verify" | "confirm" | "success" | "error"

export default function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [step, setStep] = useState<CheckInStep>("verify")
  const [otp, setOtp] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const appointment = mockAppointments.find(apt => apt.id === id)
  const patient = currentUser.patient

  // Check if appointment exists and is for today
  const today = new Date()
  const isToday = appointment && 
    new Date(appointment.dateTime).toDateString() === today.toDateString()

  const handleVerifyOTP = async () => {
    if (otp.length !== 4) {
      toast.error("Please enter the 4-digit OTP")
      return
    }

    setIsLoading(true)
    // Simulate OTP verification
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // For demo, accept any 4-digit OTP
    setStep("confirm")
    setIsLoading(false)
  }

  const handleCheckIn = async () => {
    setIsLoading(true)
    // Simulate check-in API call
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    setStep("success")
    setIsLoading(false)
    toast.success("Check-in successful!")
  }

  if (!appointment) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Appointment Not Found</h2>
            <p className="text-muted-foreground mb-6">
              We couldn&apos;t find this appointment. Please check your booking details.
            </p>
            <Button onClick={() => router.push("/patient/dashboard")}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!isToday) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-12 h-12 text-warning mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Check-in Not Available</h2>
            <p className="text-muted-foreground mb-6">
              Check-in is only available on the day of your appointment.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Your appointment is scheduled for:{" "}
              <span className="font-medium text-foreground">
                {new Date(appointment.dateTime).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </p>
            <Button onClick={() => router.push("/patient/dashboard")}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Mobile Frame Simulation */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
          {/* Status Bar Simulation */}
          <div className="h-6 bg-muted flex items-center justify-center">
            <div className="w-16 h-1 bg-foreground/20 rounded-full" />
          </div>

          {/* Header */}
          <header className="h-12 bg-muted border-b border-border flex items-center px-4 relative">
            <button 
              onClick={() => router.push("/patient/dashboard")}
              className="p-1 hover:bg-accent rounded"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-medium text-foreground">
              {step === "verify" && "Clinic Check-in"}
              {step === "confirm" && "Today's Appointment"}
              {step === "success" && "Check-in Complete"}
              {step === "error" && "Check-in Error"}
            </h1>
          </header>

          {/* Content */}
          <main className="p-6">
            {/* Step 1: OTP Verification */}
            {step === "verify" && (
              <div className="flex flex-col items-center">
                {/* QR Icon */}
                <div className="w-16 h-16 bg-muted border border-border rounded-lg flex items-center justify-center mb-4">
                  <QrCode className="w-10 h-10 text-foreground" />
                </div>

                {/* Success Message */}
                <div className="w-full bg-muted border border-border rounded-md p-3 mb-4 text-center">
                  <p className="text-sm text-foreground">
                    QR Code Scanned Successfully
                  </p>
                </div>

                {/* Instructions */}
                <p className="text-xs text-muted-foreground text-center mb-6 leading-relaxed">
                  Enter the 4-digit OTP sent to your phone to verify your appointment.
                </p>

                {/* OTP Input */}
                <InputOTP
                  maxLength={4}
                  value={otp}
                  onChange={(value) => setOtp(value)}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>

                {/* Primary Button */}
                <Button
                  className="w-full mt-6"
                  onClick={handleVerifyOTP}
                  disabled={otp.length !== 4 || isLoading}
                >
                  {isLoading ? "Verifying..." : "Verify & Continue"}
                </Button>

                {/* Resend Link */}
                <p className="text-xs text-muted-foreground text-center mt-4">
                  Didn&apos;t receive a code?{" "}
                  <button className="underline text-foreground hover:text-primary">
                    Resend OTP
                  </button>
                </p>

                {/* Demo hint */}
                <p className="text-xs text-muted-foreground text-center mt-4 p-2 bg-muted rounded">
                  Demo: Enter any 4 digits (e.g., 1234)
                </p>
              </div>
            )}

            {/* Step 2: Confirm Arrival */}
            {step === "confirm" && (
              <div className="flex flex-col items-center">
                {/* Greeting */}
                <h2 className="text-lg font-medium text-foreground text-center mb-6">
                  Welcome to the Clinic, {patient.name.split(" ")[0]}!
                </h2>

                {/* Appointment Card */}
                <div className="w-full border border-border rounded-md p-4 mb-6 bg-card">
                  <div className="flex items-start gap-3 mb-3">
                    <User className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">
                        {appointment.doctorName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {appointment.reason}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <Clock className="w-5 h-5 text-primary" />
                    <p className="text-sm text-foreground">
                      {formatTime(appointment.dateTime)} Today
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Status: Scheduled
                  </Badge>
                </div>

                {/* Primary Action Button */}
                <Button
                  className="w-full gap-2"
                  onClick={handleCheckIn}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    "Checking in..."
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Confirm Arrival / Check-in
                    </>
                  )}
                </Button>

                {/* Secondary Info */}
                <p className="text-xs text-muted-foreground text-center mt-4">
                  Press the button to let the staff know you have arrived.
                </p>
              </div>
            )}

            {/* Step 3: Success */}
            {step === "success" && (
              <div className="flex flex-col items-center text-center">
                {/* Success Icon */}
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <Check className="w-10 h-10 text-primary" />
                </div>

                <h2 className="text-xl font-semibold text-foreground mb-2">
                  You&apos;re Checked In!
                </h2>
                <p className="text-muted-foreground mb-6">
                  Please take a seat in the waiting area. We&apos;ll call you when it&apos;s your turn.
                </p>

                {/* Status Badge */}
                <Badge className="mb-6 text-sm py-1 px-3">
                  Status: Waiting
                </Badge>

                {/* Appointment Info */}
                <div className="w-full p-4 bg-muted rounded-lg mb-6">
                  <p className="text-sm text-muted-foreground mb-1">Your appointment</p>
                  <p className="font-medium text-foreground">{appointment.doctorName}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatTime(appointment.dateTime)}
                  </p>
                </div>

                <Alert>
                  <Smartphone className="w-4 h-4" />
                  <AlertDescription>
                    You&apos;ll receive a notification when it&apos;s your turn.
                  </AlertDescription>
                </Alert>

                <Button
                  variant="outline"
                  className="w-full mt-6"
                  onClick={() => router.push("/patient/dashboard")}
                >
                  Return to Dashboard
                </Button>
              </div>
            )}
          </main>

          {/* Home Indicator */}
          <div className="h-6 flex items-center justify-center">
            <div className="w-20 h-1 bg-foreground/20 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
