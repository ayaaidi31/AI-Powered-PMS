/**
 * Doctor — Settings & profile management.
 */
import { getCurrentDoctor } from "@/lib/queries"
import { SettingsClient } from "./settings-client"

export const dynamic = "force-dynamic"

export default async function DoctorSettingsPage() {
  const doctor = await getCurrentDoctor()
  if (!doctor) {
    return <div className="p-8 text-muted-foreground">No doctor account found.</div>
  }
  return <SettingsClient doctor={doctor} />
}
