/**
 * Transactional email (Resend).
 *
 * Currently used to deliver the self check-in code (Feature 3). Kept behind a
 * single env key so the rest of the app never depends on email being set up:
 * with no `RESEND_API_KEY` the send is a no-op and the code still shows in-app.
 *
 * Env:
 *   RESEND_API_KEY        — required to actually send.
 *   CHECK_IN_EMAIL_FROM   — sender, e.g. "AI-PMS Clinic <noreply@your-domain>".
 *                           Defaults to Resend's shared sandbox sender, which
 *                           only delivers to your own Resend account email until
 *                           you verify a domain.
 *   APP_URL               — base URL used to build links in the email.
 */
import { headers } from "next/headers"
import { Resend } from "resend"
import { CLINIC } from "@/lib/clinic"

const KEY = process.env.RESEND_API_KEY
const FROM = process.env.CHECK_IN_EMAIL_FROM ?? `${CLINIC.name} <onboarding@resend.dev>`

/** True when a Resend API key is configured (email can actually be sent). */
export function isEmailConfigured(): boolean {
  return Boolean(KEY)
}

/**
 * Absolute URL of the app (for QR links and emails). Resolution order:
 *   1. APP_URL env (explicit override — set this in production if you want a
 *      fixed canonical domain).
 *   2. The actual request host (from headers) — works automatically on Vercel
 *      and on the LAN, so the check-in QR always points at the domain the user
 *      is really on.
 *   3. VERCEL_URL (when there is no request scope, e.g. a background job).
 *   4. localhost fallback.
 */
export async function appUrl(path = ""): Promise<string> {
  let base = process.env.APP_URL

  if (!base) {
    try {
      const h = await headers()
      const host = h.get("x-forwarded-host") ?? h.get("host")
      if (host) {
        const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
        base = `${proto}://${host}`
      }
    } catch {
      /* no request scope (e.g. build-time or a background job) */
    }
  }

  if (!base && process.env.VERCEL_URL) base = `https://${process.env.VERCEL_URL}`

  base = (base ?? "http://localhost:3000").replace(/\/$/, "")
  return `${base}${path}`
}

interface CheckInEmail {
  to: string
  patientFirstName: string
  code: string
  doctorName: string
  whenText: string
}

/** Send the patient their self check-in code. Never throws — returns a result. */
export async function sendCheckInCodeEmail(
  params: CheckInEmail,
): Promise<{ sent: boolean; error?: string }> {
  if (!KEY) return { sent: false, error: "email_not_configured" }
  if (!params.to?.trim()) return { sent: false, error: "no_recipient" }

  try {
    const resend = new Resend(KEY)
    const { error } = await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: `Your check-in code for ${CLINIC.name}`,
      html: renderHtml(params),
      text: renderText(params),
    })
    if (error) return { sent: false, error: error.message }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "send_failed" }
  }
}

function renderText({ patientFirstName, code, doctorName, whenText }: CheckInEmail): string {
  return [
    `Hello ${patientFirstName},`,
    ``,
    `Your appointment with ${doctorName} is booked for ${whenText}.`,
    ``,
    `Your check-in code is: ${code}`,
    ``,
    `When you arrive at ${CLINIC.name}, scan the check-in QR code at reception and enter this code to let us know you're here.`,
    `Please arrive about 10 minutes early and bring your insurance card.`,
    ``,
    `${CLINIC.name}`,
    `${CLINIC.line1}`,
  ].join("\n")
}

function renderHtml({ patientFirstName, code, doctorName, whenText }: CheckInEmail): string {
  return `<!doctype html>
<html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;">
      <h1 style="margin:0 0 4px;font-size:18px;">${CLINIC.name}</h1>
      <p style="margin:0 0 20px;color:#6b7280;font-size:13px;">${CLINIC.line1}</p>
      <p style="font-size:15px;margin:0 0 12px;">Hello ${escapeHtml(patientFirstName)},</p>
      <p style="font-size:15px;margin:0 0 20px;">Your appointment with <strong>${escapeHtml(doctorName)}</strong> is booked for <strong>${escapeHtml(whenText)}</strong>.</p>
      <p style="font-size:13px;color:#6b7280;margin:0 0 8px;">Your check-in code</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:10px;text-align:center;background:#f0f4ff;border:1px solid #dbe4ff;border-radius:12px;padding:18px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(code)}</div>
      <p style="font-size:14px;margin:20px 0 0;">When you arrive, scan the check-in QR code at reception and enter this code to let us know you're here. Please arrive about 10 minutes early and bring your insurance card.</p>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin:16px 0 0;">This is an automated message from ${CLINIC.name}.</p>
  </div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}
