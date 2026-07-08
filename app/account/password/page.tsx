/**
 * Change-password page. Reached voluntarily, or forced by the proxy when a
 * staff member still holds an admin-issued temporary password.
 */
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { ChangePasswordClient } from "./change-password-client"

export const dynamic = "force-dynamic"

export default async function ChangePasswordPage() {
  const session = await getSession()
  if (!session) redirect("/")
  return <ChangePasswordClient forced={session.mustChangePassword === true} />
}
