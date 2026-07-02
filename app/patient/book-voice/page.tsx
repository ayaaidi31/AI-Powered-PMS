/**
 * Patient — "Book by voice" (Feature 11). Lets the signed-in patient talk to the
 * AI assistant to book / reschedule / cancel, as an alternative to the form.
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Sparkles } from "lucide-react"
import { getCurrentPatient } from "@/lib/queries"
import { VoiceBookingClient } from "./voice-booking-client"

export const dynamic = "force-dynamic"

export default async function BookByVoicePage() {
  const patient = await getCurrentPatient()
  if (!patient) redirect("/login")

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <Link href="/patient/appointments" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to appointments
        </Link>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" /> Book by voice
        </h1>
        <p className="text-muted-foreground">
          Talk to the assistant to book, move, or cancel an appointment — no forms.
        </p>
      </div>

      <VoiceBookingClient patientFirstName={patient.first_name} />
    </div>
  )
}
