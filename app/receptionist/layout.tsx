/**
 * Receptionist portal layout.
 *
 * Server Component: resolves the signed-in receptionist and passes their display
 * profile to the interactive shell (sidebar, notifications, settings).
 */
import { getCurrentReceptionist } from "@/lib/queries"
import { initials } from "@/lib/display"
import { ReceptionistShell } from "./receptionist-shell"

export default async function ReceptionistLayout({ children }: { children: React.ReactNode }) {
  const r = await getCurrentReceptionist()
  const profile = r
    ? {
        name: `${r.first_name} ${r.last_name}`,
        department: r.department ?? "Front Desk",
        email: r.email,
        initials: initials(r.first_name, r.last_name),
      }
    : { name: "Reception Staff", department: "Front Desk", email: "", initials: "RS" }

  return <ReceptionistShell profile={profile}>{children}</ReceptionistShell>
}
