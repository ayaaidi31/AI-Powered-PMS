/**
 * Account security page — two-factor setup (Feature 1 hardening).
 *
 * Public route (not role-guarded) so a staff member whose session is not yet
 * MFA-cleared can reach it — the proxy sends them here until they enrol. Access
 * still requires a session; a signed-out visitor is bounced to login.
 */
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { roleHome } from "@/lib/auth/jwt"
import { getTwoFactorStatus } from "@/lib/actions/auth"
import { SecurityClient } from "./security-client"

export const dynamic = "force-dynamic"

export default async function SecurityPage() {
  const session = await getSession()
  if (!session) redirect("/")
  const status = await getTwoFactorStatus()
  return (
    <SecurityClient
      enabled={status?.enabled ?? false}
      required={status?.required ?? false}
      home={roleHome(session.role)}
    />
  )
}
