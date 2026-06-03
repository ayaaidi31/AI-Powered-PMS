"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Check, Calendar, Clock, User, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { mockDoctors, mockTimeSlots } from "@/lib/mock-data"
import { toast } from "sonner"

const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

export default function NewAppointmentPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [selectedDoctor, setSelectedDoctor] = useState<string>("")
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string>("")
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const doctor = mockDoctors.find(d => d.id === selectedDoctor)

  // Generate calendar days
  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startPadding = firstDay.getDay()
    const days: (Date | null)[] = []
    
    // Add padding for days before the month starts
    for (let i = 0; i < startPadding; i++) {
      days.push(null)
    }
    
    // Add days of the month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i))
    }
    
    return days
  }

  const calendarDays = generateCalendarDays()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const isDateSelectable = (date: Date | null) => {
    if (!date) return false
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    // Can only select dates from today onwards, excluding Sundays
    return d >= today && d.getDay() !== 0
  }

  const timeSlots = ["09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30"]

  const handleSubmit = async () => {
    if (!selectedDoctor || !selectedDate || !selectedTime || !reason.trim()) {
      toast.error("Please fill in all required fields")
      return
    }

    setIsSubmitting(true)
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    toast.success("Appointment booked successfully!")
    router.push("/patient/appointments")
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const prevMonth = () => {
    const prev = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    if (prev >= new Date(today.getFullYear(), today.getMonth(), 1)) {
      setCurrentMonth(prev)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-muted">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/patient/dashboard" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">Book New Appointment</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                    s < step
                      ? "bg-primary text-primary-foreground"
                      : s === step
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}
                >
                  {s < step ? <Check className="w-5 h-5" /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`w-16 h-1 mx-2 ${
                      s < step ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Select Doctor */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <CardTitle>Select Doctor / Department</CardTitle>
                  <CardDescription>Choose your preferred healthcare provider</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Healthcare Provider</Label>
                <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {mockDoctors.map((doc) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span>{doc.department} - {doc.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {doctor && (
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium text-foreground">{doctor.name}</h4>
                  <p className="text-sm text-muted-foreground">{doctor.specialization}</p>
                  <p className="text-sm text-muted-foreground">{doctor.department}</p>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!selectedDoctor}
                >
                  Continue
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Select Date & Time */}
        {step === 2 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold">
                    2
                  </div>
                  <div>
                    <CardTitle>Select Date & Time</CardTitle>
                    <CardDescription>Pick your preferred appointment slot</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Calendar */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <Button variant="ghost" size="icon" onClick={prevMonth}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="font-medium">
                      {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </span>
                    <Button variant="ghost" size="icon" onClick={nextMonth}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {daysOfWeek.map((day) => (
                      <div
                        key={day}
                        className="text-center text-xs font-medium text-muted-foreground py-2"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((date, index) => {
                      const isSelectable = isDateSelectable(date)
                      const isSelected = selectedDate && date && 
                        selectedDate.toDateString() === date.toDateString()
                      
                      return (
                        <button
                          key={index}
                          onClick={() => date && isSelectable && setSelectedDate(date)}
                          disabled={!isSelectable}
                          className={`
                            p-2 text-sm rounded-md transition-colors
                            ${!date ? "invisible" : ""}
                            ${isSelected 
                              ? "bg-primary text-primary-foreground" 
                              : isSelectable
                                ? "hover:bg-accent text-foreground"
                                : "text-muted-foreground/50 cursor-not-allowed"
                            }
                          `}
                        >
                          {date?.getDate()}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Time Slots */}
                {selectedDate && (
                  <div>
                    <Label className="mb-3 block">Available Times</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {timeSlots.map((time) => (
                        <button
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className={`
                            p-3 text-sm rounded-md border transition-colors
                            ${selectedTime === time
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border hover:border-primary hover:bg-accent"
                            }
                          `}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={!selectedDate || !selectedTime}
                  >
                    Continue
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Selected Info Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Appointment Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {doctor && (
                  <div className="flex items-start gap-3">
                    <User className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">{doctor.name}</p>
                      <p className="text-sm text-muted-foreground">{doctor.department}</p>
                    </div>
                  </div>
                )}
                {selectedDate && (
                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">
                        {selectedDate.toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                )}
                {selectedTime && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">{selectedTime}</p>
                      <p className="text-sm text-muted-foreground">30 minutes</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Confirm Booking */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold">
                  3
                </div>
                <div>
                  <CardTitle>Confirm Your Booking</CardTitle>
                  <CardDescription>Review and confirm your appointment details</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Appointment Summary */}
              <div className="p-4 bg-muted rounded-lg space-y-4">
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Doctor</p>
                    <p className="font-medium">{doctor?.name}</p>
                    <p className="text-sm text-muted-foreground">{doctor?.department}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Date & Time</p>
                    <p className="font-medium">
                      {selectedDate?.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })} at {selectedTime}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reason for Visit */}
              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Visit *</Label>
                <Textarea
                  id="reason"
                  placeholder="Please briefly describe the reason for your visit..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                />
              </div>

              <Alert>
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  By confirming, you agree to arrive 10 minutes before your scheduled time. 
                  Cancellations must be made at least 24 hours in advance.
                </AlertDescription>
              </Alert>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!reason.trim() || isSubmitting}
                >
                  {isSubmitting ? "Booking..." : "Confirm Booking"}
                  {!isSubmitting && <Check className="w-4 h-4 ml-2" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
