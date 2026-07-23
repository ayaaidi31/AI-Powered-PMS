/**
 * Authorization guards for the Server Actions (defence in depth).
 *
 * The proxy guards page navigation, but Server Actions are callable endpoints in
 * their own right, so each sensitive action verifies the caller as well.
 * Identity is taken from the session, not from identifiers supplied by the client.
 *
 * Every guard returns a discriminated `Guard<T>`: `{ ok: true, value }` on
 * success, or `{ ok: false, error }` carrying a ready-to-return `ActionResult`.
 * A typical action reads:
 *
 *   const g = await requireDoctor()
 *   if (!g.ok) return g.error
 *   const doctorId = g.value.profileId
 */
import "server-only"
import { getSession } from "@/lib/auth/session"
import type { SessionPayload, Role } from "@/lib/auth/jwt"
import { fail, type ActionResult } from "@/lib/actions/types"

export type Guard<T> = { ok: true; value: T } | { ok: false; error: ActionResult<never> }

const deny = (message = "You are not authorized to perform this action."): { ok: false; error: ActionResult<never> } =>
  ({ ok: false, error: fail(message) })

/** Any authenticated user. */
export async function requireSession(): Promise<Guard<SessionPayload>> {
  const session = await getSession()
  if (!session) return deny("Please sign in.")
  return { ok: true, value: session }
}

/** One of the given roles (admin always passes — it is the superuser role). */
export async function requireRole(...roles: Role[]): Promise<Guard<SessionPayload>> {
  const session = await getSession()
  if (!session) return deny("Please sign in.")
  if (session.role !== "admin" && !roles.includes(session.role)) return deny()
  return { ok: true, value: session }
}

/** Any staff member (doctor / receptionist / admin) — no patients. */
export const requireStaff = (): Promise<Guard<SessionPayload>> =>
  requireRole("doctor", "receptionist", "admin")

/** A doctor session with a resolved doctor profile id. */
export async function requireDoctor(): Promise<Guard<SessionPayload & { profileId: string }>> {
  const g = await requireRole("doctor")
  if (!g.ok) return g
  if (!g.value.profileId) return deny("No doctor profile is linked to this account.")
  return { ok: true, value: g.value as SessionPayload & { profileId: string } }
}

/** A receptionist / admin session. */
export const requireReceptionist = (): Promise<Guard<SessionPayload>> =>
  requireRole("receptionist", "admin")

/** A patient session with a resolved patient profile id. */
export async function requirePatient(): Promise<Guard<{ session: SessionPayload; patientId: string }>> {
  const session = await getSession()
  if (!session) return deny("Please sign in.")
  if (session.role !== "patient" || !session.profileId) return deny()
  return { ok: true, value: { session, patientId: session.profileId } }
}

/**
 * For actions usable by both staff and the owning patient. `isStaff` = the caller
 * may act on any record; `patientId` = the caller's own patient id (null for
 * staff). The action then checks ownership for the patient case.
 */
export async function requireSessionScoped(): Promise<
  Guard<{ session: SessionPayload; isStaff: boolean; patientId: string | null }>
> {
  const session = await getSession()
  if (!session) return deny("Please sign in.")
  const isStaff = session.role !== "patient"
  return { ok: true, value: { session, isStaff, patientId: isStaff ? null : session.profileId } }
}
