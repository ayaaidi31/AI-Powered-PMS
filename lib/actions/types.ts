/**
 * Shared types for the Server Action layer.
 *
 * Kept in a plain module (not a "use server" file) so it may export types and
 * constants in addition to functions. Action modules import the discriminated
 * `ActionResult` union to return a uniform, serializable shape to the client.
 */

/**
 * Uniform result returned by every mutating Server Action.
 *
 *  - `ok`        — the operation succeeded; `data` carries any payload.
 *  - `error`     — validation or business-rule failure; `message` is safe to
 *                  surface in the UI and `fieldErrors` maps to form fields.
 *  - `conflict`  — a recoverable conflict the caller may choose to override,
 *                  e.g. a suspected duplicate patient (REQ-REC-11) or a slot
 *                  that was taken concurrently (REQ-SCHED-03).
 */
export type ActionResult<T = void> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "conflict"; message: string; data?: T }

export const ok = <T>(data: T): ActionResult<T> => ({ status: "ok", data })

export const fail = (
  message: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> => ({ status: "error", message, fieldErrors })

export const conflict = <T>(message: string, data?: T): ActionResult<T> => ({
  status: "conflict",
  message,
  data,
})
