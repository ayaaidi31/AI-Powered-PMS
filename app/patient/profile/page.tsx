/**
 * Patient — My Profile (Feature 10 surface).
 *
 * Server Component: loads the current patient and their clinical alerts
 * (allergies, conditions, medications), then renders the editable profile.
 */
import { getCurrentPatient, getPatientClinical } from "@/lib/queries"
import { getPendingProfileProposals } from "@/lib/actions/profile-proposals"
import { getTwoFactorStatus } from "@/lib/actions/auth"
import { getT } from "@/lib/i18n/server"
import { ProfileClient } from "./profile-client"

export const dynamic = "force-dynamic"

export default async function PatientProfilePage() {
  const { t } = await getT()
  const patient = await getCurrentPatient()
  if (!patient) {
    return <div className="p-8 text-muted-foreground">{t("patientProfile.noPatientAccount")}</div>
  }
  const [clinical, proposals, twoFactor] = await Promise.all([
    getPatientClinical(patient.id),
    getPendingProfileProposals(patient.id),
    getTwoFactorStatus(),
  ])
  return (
    <ProfileClient
      patient={patient}
      vitals={clinical.currentVitals}
      proposals={proposals}
      twoFactorEnabled={twoFactor?.enabled ?? false}
      alerts={{
        allergies: clinical.allergies.map((a) => a.substance),
        conditions: clinical.conditions.map((c) => c.label ?? c.icd10_code),
        medications: clinical.medications.map((m) => ({ name: m.name, dosage: m.dosage, frequency: m.frequency })),
      }}
    />
  )
}
