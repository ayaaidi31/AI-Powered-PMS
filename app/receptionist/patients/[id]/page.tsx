/**
 * Receptionist — Patient detail. Same shared profile as the doctor portal
 * (profile, clinical summary, reports, appointments, billing documents).
 */
import { notFound } from "next/navigation"
import { loadPatientDetail } from "@/lib/patient-detail"
import { getCurrentReceptionist } from "@/lib/queries"
import { PatientDetailClient } from "@/components/patient-detail-client"

export const dynamic = "force-dynamic"

export default async function ReceptionistPatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [data, receptionist] = await Promise.all([loadPatientDetail(id), getCurrentReceptionist()])
  if (!data) notFound()
  return (
    <PatientDetailClient
      {...data}
      backHref="/receptionist/patients"
      viewerRole="receptionist"
      currentUserId={receptionist?.id ?? null}
    />
  )
}
