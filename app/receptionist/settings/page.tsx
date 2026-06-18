/**
 * Receptionist — Settings & profile management.
 */
import { getCurrentReceptionist } from "@/lib/queries"
import { SettingsClient } from "./settings-client"

export const dynamic = "force-dynamic"

export default async function ReceptionistSettingsPage() {
  const receptionist = await getCurrentReceptionist()
  if (!receptionist) {
    return <div className="p-8 text-muted-foreground">No receptionist account found.</div>
  }
  return <SettingsClient receptionist={receptionist} />
}
