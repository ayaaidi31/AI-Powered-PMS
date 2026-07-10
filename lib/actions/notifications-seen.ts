"use server"

/**
 * Server-side "seen" tracking for the notification bell (any role).
 *
 * The bell is derived (no notifications table), but we persist WHICH items the
 * user has already opened on their `users` row — so the unread badge clears
 * consistently across all of that user's devices, not just the one browser.
 */
import { getSession } from "@/lib/auth/session"
import { query } from "@/lib/db"

/** Ids the signed-in user has already seen. */
export async function getSeenNotificationIds(): Promise<string[]> {
  const session = await getSession()
  if (!session) return []
  const r = await query<{ notification_seen_ids: string[] | null }>(
    `SELECT notification_seen_ids FROM users WHERE id = $1`,
    [session.userId],
  )
  return r.rows[0]?.notification_seen_ids ?? []
}

/** Replace the seen set with the ids currently shown (called when the bell opens). */
export async function markNotificationsSeen(ids: string[]): Promise<void> {
  const session = await getSession()
  if (!session) return
  // Store only the ids currently shown; capped to keep the row small.
  await query(`UPDATE users SET notification_seen_ids = $2 WHERE id = $1`, [session.userId, ids.slice(0, 50)])
}
