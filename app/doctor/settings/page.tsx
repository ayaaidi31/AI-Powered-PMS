/**
 * Doctor — Settings & profile management.
 */
import { getCurrentDoctor } from "@/lib/queries"
import { getT } from "@/lib/i18n/server"
import { SettingsClient } from "./settings-client"

export const dynamic = "force-dynamic"

export default async function DoctorSettingsPage() {
  const { t } = await getT()
  const doctor = await getCurrentDoctor()
  if (!doctor) {
    return <div className="p-8 text-muted-foreground">{t("settings.noDoctorAccount")}</div>
  }
  return <SettingsClient doctor={doctor} />
}
