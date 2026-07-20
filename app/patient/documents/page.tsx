/**
 * Patient — Documents. Shows every file on the record: imaging and reports the
 * practice has shared, plus anything the patient has added. The patient can read
 * or download each one, upload new files with a title and description, and remove
 * the files they uploaded themselves.
 */
import { getCurrentPatient, getPatientDocuments } from "@/lib/queries"
import { PatientDocuments } from "@/components/patient-documents"
import { getT } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

export default async function PatientDocumentsPage() {
  const { t } = await getT()
  const patient = await getCurrentPatient()
  if (!patient) {
    return <div className="p-8 text-muted-foreground">{t("patientRecords.noPatientAccount")}</div>
  }
  const documents = await getPatientDocuments(patient.id)

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{t("patientRecords.documentsTitle")}</h1>
          <p className="text-muted-foreground">{t("patientRecords.documentsSubtitle")}</p>
        </div>
        <PatientDocuments
          patientId={patient.id}
          documents={documents}
          canUpload
          viewerRole="patient"
          currentUserId={patient.id}
        />
      </div>
    </div>
  )
}
