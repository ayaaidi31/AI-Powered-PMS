/**
 * Doctor — Patient detail. Uses the shared loader + shared profile component.
 */
import { notFound } from "next/navigation"
import { loadPatientDetail } from "@/lib/patient-detail"
import { getCurrentDoctor } from "@/lib/queries"
import { PatientDetailClient } from "@/components/patient-detail-client"

export const dynamic = "force-dynamic"

export default async function DoctorPatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const doctor = await getCurrentDoctor()
  const data = await loadPatientDetail(id, doctor?.id)
  if (!data) notFound()
  return (
    <PatientDetailClient
      {...data}
      backHref="/doctor/patients"
      viewerRole="doctor"
      currentUserId={doctor?.id ?? null}
    />
  )
}
