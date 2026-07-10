/**
 * Runs once when the server process starts (Next.js instrumentation hook).
 *
 * Pins the process timezone to the clinic's zone so that all server-side date
 * logic — office hours, the voice assistant's slot availability, invoice
 * numbering — is computed in local clinic time regardless of the host. Vercel,
 * for instance, runs functions in UTC by default. An explicit TZ environment
 * variable still takes precedence for a clinic in another zone.
 */
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ ||= "Europe/Berlin"
  }
}
