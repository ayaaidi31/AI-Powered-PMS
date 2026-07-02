/**
 * Receptionist — Patient Directory (Feature 5).
 *
 * Server Component: loads the live patient list from the database and hands it
 * to the interactive client view. Re-runs whenever the patient actions call
 * `revalidatePath("/receptionist/patients")`.
 */
import { getPatients } from "@/lib/queries"
import { PatientsClient } from "./patients-client"

// Live patient data must be fetched per request, never statically cached.
export const dynamic = "force-dynamic"

export default async function PatientsPage() {
  const patients = await getPatients()
  return <PatientsClient initialPatients={patients} />
}
