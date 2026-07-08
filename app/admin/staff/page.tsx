/**
 * Admin — create staff accounts (doctor / receptionist). Admin-only; the proxy
 * guards the /admin area. Provisioning issues a one-time temporary password the
 * new staff member must change on first login.
 */
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { AdminStaffClient } from "./admin-staff-client"

export const dynamic = "force-dynamic"

export default async function AdminStaffPage() {
  const session = await getSession()
  if (!session || session.role !== "admin") redirect("/")
  return <AdminStaffClient />
}
