/**
 * Patient — My Profile (Feature 15 surface).
 *
 * Server Component: loads the current patient and their clinical alerts
 * (allergies, conditions, medications), then renders the editable profile.
 */
import { getCurrentPatient, getPatientClinical } from "@/lib/queries"
import { ProfileClient } from "./profile-client"

export const dynamic = "force-dynamic"

export default async function PatientProfilePage() {
  const patient = await getCurrentPatient()
  if (!patient) {
    return <div className="p-8 text-muted-foreground">No patient account found.</div>
  }
  const clinical = await getPatientClinical(patient.id)
  return (
    <ProfileClient
      patient={patient}
      vitals={clinical.currentVitals}
      alerts={{
        allergies: clinical.allergies.map((a) => a.substance),
        conditions: clinical.conditions.map((c) => c.label ?? c.icd10_code),
        medications: clinical.medications.map((m) => ({ name: m.name, dosage: m.dosage, frequency: m.frequency })),
      }}
    />
  )
}
