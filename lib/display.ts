/**
 * lib/display.ts — presentation helpers shared across the UI.
 *
 * These map the database's storage conventions (German insurance codes, money
 * in cents, separate name columns) onto human-readable strings. They are pure
 * functions and safe to import in both Server and Client Components.
 */
import type { PatientRow, DoctorRow } from "./seed-data"

/** Full patient name from the separate first/last name columns. */
export function patientName(p: Pick<PatientRow, "first_name" | "last_name">): string {
  return `${p.first_name} ${p.last_name}`.trim()
}

/** Doctor display name, prefixed with the clinical title. */
export function doctorName(d: Pick<DoctorRow, "first_name" | "last_name">): string {
  return `Dr. ${d.first_name} ${d.last_name}`.trim()
}

/** Initials for avatar fallbacks. */
export function initials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()
}

export type InsuranceType = PatientRow["insurance_type"]

/** Short German insurance label shown in badges. */
export function insuranceLabel(type: InsuranceType): string {
  switch (type) {
    case "gkv": return "GKV"
    case "pkv": return "PKV"
    case "selbstzahler": return "Self-Pay"
  }
}

/** Badge variant per insurance type, kept consistent across screens. */
export function insuranceVariant(type: InsuranceType): "default" | "secondary" | "outline" {
  switch (type) {
    case "gkv": return "default"
    case "pkv": return "secondary"
    case "selbstzahler": return "outline"
  }
}

/** Format an integer cents amount as a Euro string (German invoicing). */
export function formatCents(cents: number | null): string {
  if (cents == null) return "—"
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100)
}

/** Split an ISO timestamp into readable date and time parts. */
export function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  }
}

export type AppointmentStatusDb =
  | "scheduled" | "waiting" | "in_progress" | "completed" | "cancelled" | "no_show"

/** Human label for an appointment status. */
export function statusLabel(status: AppointmentStatusDb): string {
  const labels: Record<AppointmentStatusDb, string> = {
    scheduled: "Scheduled",
    waiting: "Waiting",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No Show",
  }
  return labels[status]
}

/** Tailwind background colour used for status chips in the calendar. */
export function statusColor(status: AppointmentStatusDb): string {
  switch (status) {
    case "waiting": return "bg-yellow-500"
    case "in_progress": return "bg-blue-500"
    case "completed": return "bg-green-500"
    case "cancelled": return "bg-red-500"
    case "no_show": return "bg-muted-foreground"
    default: return "bg-primary"
  }
}

/**
 * How an appointment was booked, for at-a-glance provenance chips.
 * 'manual' = front desk · 'online' = patient self-service · 'ai_voice' = AI agent.
 */
export function bookingSource(source?: string | null): { label: string; className: string } {
  switch (source) {
    case "ai_voice": return { label: "AI assistant", className: "border-primary/30 text-primary" }
    case "online": return { label: "Online", className: "border-blue-500/30 text-blue-600" }
    default: return { label: "Front desk", className: "border-border text-muted-foreground" }
  }
}
