/**
 * Clinic timezone handling.
 *
 * Appointment times are anchored to the clinic's zone (Europe/Berlin), not the
 * browser's, so a booking made from any machine refers to the same wall-clock
 * time at the clinic. Instants are stored as UTC (timestamptz); this converts a
 * clinic-local wall time to that instant independently of where the code runs.
 */
export const CLINIC_TIME_ZONE = "Europe/Berlin"

/**
 * Convert a wall-clock time in the clinic's zone to the matching UTC ISO string,
 * regardless of the runtime's own timezone. The month is zero-based, matching
 * Date.getMonth(). DST transitions aside (the ambiguous/skipped hour), this maps
 * a chosen clinic time to the correct absolute instant.
 */
export function clinicWallTimeToUtcIso(
  year: number, month: number, day: number, hours: number, minutes: number,
): string {
  // Interpret the wall time as if it were UTC, then measure how the clinic zone
  // renders that instant; the difference is the zone offset to remove.
  const asUtc = Date.UTC(year, month, day, hours, minutes)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(asUtc))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  let hour = get("hour")
  if (hour === 24) hour = 0 // some environments render midnight as 24
  const rendered = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"))
  const offset = rendered - asUtc
  return new Date(asUtc - offset).toISOString()
}

/**
 * Same conversion from a "YYYY-MM-DD" date and "HH:MM" time (the shapes used by
 * the date/time form inputs).
 */
export function clinicDateTimeToUtcIso(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  const [hours, minutes] = timeStr.split(":").map(Number)
  return clinicWallTimeToUtcIso(year, month - 1, day, hours, minutes)
}
