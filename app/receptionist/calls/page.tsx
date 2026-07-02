/**
 * Receptionist — "AI Call Agent" review queue (Feature 11).
 *
 * Lists the appointments the AI voice assistant booked for patients so staff can
 * verify the details and confirm them — or flag any with wrong information to fix
 * or cancel. The agent itself runs in the patient app (/patient/book-voice).
 */
import { getVoiceAgentAppointments } from "@/lib/queries"
import { CallsClient, type VoiceBooking } from "./calls-client"

export const dynamic = "force-dynamic"

export default async function CallAgentPage() {
  const rows = await getVoiceAgentAppointments()
  const bookings: VoiceBooking[] = rows.map((a) => ({
    id: a.id,
    patientName: a.patient_name,
    doctorName: a.doctor_name,
    startsAt: a.starts_at,
    status: a.status,
    reason: a.reason,
    reviewStatus: (a.ai_review_status as VoiceBooking["reviewStatus"]) ?? "pending",
  }))

  return <CallsClient bookings={bookings} />
}
