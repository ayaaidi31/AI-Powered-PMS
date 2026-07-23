"use client"

/**
 * Three-step booking wizard (Feature 2 — UC-PAT-02): choose a doctor, pick a
 * date and time, then confirm with a reason for the visit. Submission calls the
 * `bookAppointment` Server Action, which performs the real-time availability
 * check and double-booking guard (REQ-SCHED-03) before creating the record.
 *
 * With a `reschedule` context (Feature 4 — UC-PAT-03) the same wizard EDITS an
 * existing appointment: the patient may change the doctor, the date/time and the
 * reason for visit. Submission calls `rescheduleAppointment`, which applies all
 * changes in one transaction (re-running the availability and double-booking
 * guards against the chosen doctor) rather than creating a new record.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Check, Calendar, Clock, User, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "sonner"
import type { DoctorRow } from "@/lib/seed-data"
import { doctorName } from "@/lib/display"
import { bookAppointment, rescheduleAppointment, getDoctorDayAvailability, type DaySlot } from "@/lib/actions/appointments"
import { clinicWallTimeToUtcIso } from "@/lib/timezone"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"
import type { TKey } from "@/lib/i18n/translate"

const weekdayKeys = ["su", "mo", "tu", "we", "th", "fr", "sa"] as const

/** When set, the wizard edits an existing appointment (same doctor) instead of booking a new one. */
export interface RescheduleContext {
  id: string
  doctorId: string
  reason: string
}

export function NewAppointmentClient({
  doctors,
  patientId,
  reschedule = null,
}: {
  doctors: DoctorRow[]
  patientId: string
  reschedule?: RescheduleContext | null
}) {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const [step, setStep] = useState(1)
  const [selectedDoctor, setSelectedDoctor] = useState<string>(reschedule?.doctorId ?? "")
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string>("")
  const [reason, setReason] = useState(reschedule?.reason ?? "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [daySlots, setDaySlots] = useState<DaySlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  const doctor = doctors.find((d) => d.id === selectedDoctor)

  // Load the doctor's real availability for the chosen day. The full clinic grid
  // is shown with taken or too-soon slots disabled, so the patient sees every
  // time and picks only from what is genuinely open (no surprise at submit).
  useEffect(() => {
    if (!selectedDoctor || !selectedDate) {
      setDaySlots([])
      return
    }
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    let cancelled = false
    setLoadingSlots(true)
    getDoctorDayAvailability(selectedDoctor, dateStr, reschedule?.id)
      .then((res) => {
        if (cancelled) return
        const slots = res.status === "ok" ? res.data : []
        setDaySlots(slots)
        // Drop a previously chosen time if it is no longer bookable.
        setSelectedTime((t) => (t && slots.some((s) => s.time === t && s.available) ? t : ""))
      })
      .finally(() => { if (!cancelled) setLoadingSlots(false) })
    return () => { cancelled = true }
  }, [selectedDoctor, selectedDate, reschedule?.id])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  function generateCalendarDays() {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const lastDay = new Date(year, month + 1, 0)
    const startPadding = new Date(year, month, 1).getDay()
    const days: (Date | null)[] = []
    for (let i = 0; i < startPadding; i++) days.push(null)
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i))
    return days
  }
  const calendarDays = generateCalendarDays()

  // Absence window of the chosen doctor (dates the patient must not be able to pick).
  const absenceFrom = doctor?.is_available ? null : doctor?.unavailable_from ?? null
  const absenceUntil = doctor?.is_available ? null : doctor?.unavailable_until ?? null

  const isDateSelectable = (date: Date | null) => {
    if (!date) return false
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    if (d < today || d.getDay() === 0) return false // today onwards, excluding Sundays
    // Block dates inside the selected doctor's absence window.
    if (absenceFrom) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      const from = absenceFrom.slice(0, 10)
      const until = absenceUntil ? absenceUntil.slice(0, 10) : null
      if (key >= from && (!until || key <= until)) return false
    }
    return true
  }

  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  const prevMonth = () => {
    const prev = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    if (prev >= new Date(today.getFullYear(), today.getMonth(), 1)) setCurrentMonth(prev)
  }

  async function handleSubmit() {
    if (!selectedDoctor || !selectedDate || !selectedTime || !reason.trim()) {
      toast.error(t("patient.fillRequired"))
      return
    }
    // Build the absolute start instant from the chosen date and time, anchored to
    // the clinic's timezone so the slot is the same wall-clock time regardless of
    // the booking device's own zone.
    const [hh, mm] = selectedTime.split(":").map(Number)
    const startsAt = clinicWallTimeToUtcIso(
      selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), hh, mm,
    )

    setIsSubmitting(true)
    const result = reschedule
      ? await rescheduleAppointment(reschedule.id, startsAt, {
          durationMin: 30, enforce24hWindow: true,
          newDoctorId: selectedDoctor, reason: reason.trim(),
        })
      : await bookAppointment({
          patient_id: patientId, doctor_id: selectedDoctor,
          starts_at: startsAt, duration_min: 30, reason, source: "online",
        })
    setIsSubmitting(false)

    if (result.status === "ok") {
      toast.success(reschedule ? t("patient.appointmentUpdated") : t("patient.bookedSuccess"))
      router.push("/patient/appointments")
      router.refresh()
    } else {
      // Includes the "slot just taken" conflict (REQ-SCHED-03).
      toast.error(result.message)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-muted">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/patient/dashboard" className="text-muted-foreground hover:text-foreground">{t("patient.nav.dashboard")}</Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">{reschedule ? t("patient.editAppointment") : t("patient.bookNewAppointment")}</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  s <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"
                }`}>
                  {s < step ? <Check className="w-5 h-5" /> : s}
                </div>
                {s < 3 && <div className={`w-16 h-1 mx-2 ${s < step ? "bg-primary" : "bg-border"}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Select Doctor */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold">1</div>
                <div>
                  <CardTitle>{t("patient.selectDoctorDept")}</CardTitle>
                  <CardDescription>
                    {reschedule ? t("patient.changeOrKeepDoctor") : t("patient.chooseProvider")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t("patient.healthcareProvider")}</Label>
                <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t("patient.selectADoctor")} /></SelectTrigger>
                  <SelectContent>
                    {doctors.map((doc) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span>{doc.department} — {doctorName(doc)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {doctor && (
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium text-foreground">{doctorName(doctor)}</h4>
                  <p className="text-sm text-muted-foreground">{doctor.specialization}</p>
                  <p className="text-sm text-muted-foreground">{doctor.department}</p>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => setStep(2)} disabled={!selectedDoctor}>
                  {t("patient.continue")} <ChevronRight className="w-4 h-4 ml-2" />
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
                  <div className="w-10 h-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold">2</div>
                  <div>
                    <CardTitle>{t("patient.selectDateTime")}</CardTitle>
                    <CardDescription>{t("patient.pickSlot")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
                    <span className="font-medium">{currentMonth.toLocaleDateString(INTL_LOCALE[locale], { month: "long", year: "numeric" })}</span>
                    <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {weekdayKeys.map((day) => (
                      <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">{t(`patient.weekday.${day}` as TKey)}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((date, index) => {
                      const selectable = isDateSelectable(date)
                      const isSelected = selectedDate && date && selectedDate.toDateString() === date.toDateString()
                      return (
                        <button
                          key={index}
                          onClick={() => date && selectable && setSelectedDate(date)}
                          disabled={!selectable}
                          className={`p-2 text-sm rounded-md transition-colors ${!date ? "invisible" : ""} ${
                            isSelected ? "bg-primary text-primary-foreground"
                              : selectable ? "hover:bg-accent text-foreground"
                              : "text-muted-foreground/50 cursor-not-allowed"
                          }`}
                        >
                          {date?.getDate()}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {selectedDate && (
                  <div>
                    <Label className="mb-3 block">{t("patient.availableTimes")}</Label>
                    {loadingSlots ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="w-4 h-4 animate-spin" /> {t("patient.checkingAvailability")}
                      </div>
                    ) : daySlots.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        {t("patient.noTimesLoaded")}
                      </p>
                    ) : daySlots.every((s) => !s.available) ? (
                      <p className="text-sm text-muted-foreground py-4">
                        {t("patient.fullyBooked")}
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {daySlots.map(({ time, available }) => (
                          <button
                            key={time}
                            onClick={() => available && setSelectedTime(time)}
                            disabled={!available}
                            title={available ? undefined : t("patient.notAvailable")}
                            className={`p-3 text-sm rounded-md border transition-colors ${
                              selectedTime === time ? "bg-primary text-primary-foreground border-primary"
                                : !available ? "border-border bg-muted text-muted-foreground/50 line-through cursor-not-allowed"
                                : "border-border hover:border-primary hover:bg-accent"
                            }`}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft className="w-4 h-4 mr-2" />{t("patient.back")}</Button>
                  <Button onClick={() => setStep(3)} disabled={!selectedDate || !selectedTime}>
                    {t("patient.continue")} <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">{t("patient.appointmentSummary")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {doctor && (
                  <div className="flex items-start gap-3">
                    <User className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">{doctorName(doctor)}</p>
                      <p className="text-sm text-muted-foreground">{doctor.department}</p>
                    </div>
                  </div>
                )}
                {selectedDate && (
                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-primary mt-0.5" />
                    <p className="font-medium">
                      {selectedDate.toLocaleDateString(INTL_LOCALE[locale], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                )}
                {selectedTime && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">{selectedTime}</p>
                      <p className="text-sm text-muted-foreground">{t("patient.minutes30")}</p>
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
                <div className="w-10 h-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center font-bold">3</div>
                <div>
                  <CardTitle>{reschedule ? t("patient.confirmChanges") : t("patient.confirmBooking")}</CardTitle>
                  <CardDescription>{t("patient.reviewConfirm")}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-muted rounded-lg space-y-4">
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("patient.doctorLabel")}</p>
                    <p className="font-medium">{doctor && doctorName(doctor)}</p>
                    <p className="text-sm text-muted-foreground">{doctor?.department}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t("patient.dateTimeLabel")}</p>
                    <p className="font-medium">
                      {t("patient.dateTimeAt", { date: selectedDate?.toLocaleDateString(INTL_LOCALE[locale], { weekday: "long", month: "long", day: "numeric" }) ?? "", time: selectedTime })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">{t("patient.reasonForVisit")} *</Label>
                <Textarea
                  id="reason"
                  placeholder={t("patient.reasonPlaceholder")}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                />
              </div>

              <Alert>
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  {t("patient.confirmDisclaimer")}
                </AlertDescription>
              </Alert>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-2" />{t("patient.back")}</Button>
                <Button onClick={handleSubmit} disabled={!reason.trim() || isSubmitting}>
                  {isSubmitting ? (reschedule ? t("patient.saving") : t("patient.booking")) : (reschedule ? t("patient.saveChanges") : t("patient.confirmBookingBtn"))}
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
