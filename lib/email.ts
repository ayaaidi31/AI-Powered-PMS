/**
 * Transactional email (Resend).
 *
 * Currently used to deliver the self check-in code (Feature 3). Kept behind a
 * single env key so the rest of the app never depends on email being set up:
 * with no `RESEND_API_KEY` the send is a no-op and the code still shows in-app.
 *
 * Env:
 *   RESEND_API_KEY        — required to actually send.
 *   CHECK_IN_EMAIL_FROM   — sender, e.g. "AI-PMS Clinic <noreply@example.com>".
 *                           Defaults to Resend's shared sandbox sender, which
 *                           only delivers to the account owner's own Resend email
 *                           until a domain is verified.
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
 *   1. APP_URL env (explicit override — set in production for a fixed canonical
 *      domain).
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

/** Send a newly-provisioned staff member their temporary login password. */
export async function sendStaffCredentialsEmail(params: {
  to: string
  firstName: string
  role: string
  tempPassword: string
  loginUrl: string
}): Promise<{ sent: boolean; error?: string }> {
  if (!KEY) return { sent: false, error: "email_not_configured" }
  if (!params.to?.trim()) return { sent: false, error: "no_recipient" }
  try {
    const resend = new Resend(KEY)
    const { error } = await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: `Your ${CLINIC.name} staff account`,
      text: `Hello ${params.firstName},\n\nA ${params.role} account has been created for you at ${CLINIC.name}.\n\nSign in at: ${params.loginUrl}\nEmail: ${params.to}\nTemporary password: ${params.tempPassword}\n\nYou'll be asked to set a new password and enable two-factor authentication on first login.\n\n${CLINIC.name}`,
      html: `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
        <div style="max-width:520px;margin:0 auto;padding:24px;">
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;">
            <h1 style="margin:0 0 4px;font-size:18px;">${CLINIC.name}</h1>
            <p style="font-size:15px;margin:16px 0 12px;">Hello ${escapeHtml(params.firstName)},</p>
            <p style="font-size:15px;margin:0 0 16px;">A <strong>${escapeHtml(params.role)}</strong> account has been created for you. Use this temporary password to sign in:</p>
            <div style="font-size:26px;font-weight:700;letter-spacing:4px;text-align:center;background:#f0f4ff;border:1px solid #dbe4ff;border-radius:12px;padding:16px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(params.tempPassword)}</div>
            <p style="font-size:14px;margin:16px 0 8px;"><a href="${escapeHtml(params.loginUrl)}" style="color:#2563eb;">Sign in here</a> with your email (${escapeHtml(params.to)}).</p>
            <p style="font-size:13px;color:#6b7280;margin:0;">You'll be asked to set a new password and enable two-factor authentication on first login.</p>
          </div>
        </div></body></html>`,
    })
    if (error) return { sent: false, error: error.message }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "send_failed" }
  }
}

/** Notify a patient that a new consultation report is available. Best-effort. */
export async function sendReportReadyEmail(params: {
  to: string
  firstName: string
  portalUrl: string
}): Promise<{ sent: boolean; error?: string }> {
  return simpleEmail({
    to: params.to,
    subject: `Your ${CLINIC.name} report is ready`,
    heading: `Hello ${params.firstName},`,
    body: "Your consultation report is now available in your patient portal.",
    ctaLabel: "View my report",
    ctaUrl: params.portalUrl,
  })
}

/** Notify a patient that an invoice is ready and payable. Best-effort. */
export async function sendInvoiceReadyEmail(params: {
  to: string
  firstName: string
  amountText: string
  dueText: string | null
  portalUrl: string
}): Promise<{ sent: boolean; error?: string }> {
  return simpleEmail({
    to: params.to,
    subject: `Your ${CLINIC.name} invoice`,
    heading: `Hello ${params.firstName},`,
    body: `Your invoice for ${params.amountText} is ready.${params.dueText ? ` Payment is due by ${params.dueText}.` : ""} You can view and download it in your patient portal.`,
    ctaLabel: "View my invoice",
    ctaUrl: params.portalUrl,
  })
}

/** Remind a patient of an upcoming appointment (day-before). Best-effort. */
export async function sendAppointmentReminderEmail(params: {
  to: string
  firstName: string
  whenText: string
  portalUrl: string
}): Promise<{ sent: boolean; error?: string }> {
  return simpleEmail({
    to: params.to,
    subject: `Reminder: your ${CLINIC.name} appointment`,
    heading: `Hello ${params.firstName},`,
    body: `This is a reminder of your upcoming appointment on ${params.whenText}. Please arrive about 10 minutes early and bring your insurance card.`,
    ctaLabel: "View my appointments",
    ctaUrl: params.portalUrl,
  })
}

/** Small shared transactional email (heading + body + optional button). */
async function simpleEmail(params: {
  to: string
  subject: string
  heading: string
  body: string
  ctaLabel?: string
  ctaUrl?: string
}): Promise<{ sent: boolean; error?: string }> {
  if (!KEY) return { sent: false, error: "email_not_configured" }
  if (!params.to?.trim()) return { sent: false, error: "no_recipient" }
  const button = params.ctaLabel && params.ctaUrl
    ? `<p style="margin:22px 0 0;"><a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">${escapeHtml(params.ctaLabel)}</a></p>`
    : ""
  try {
    const resend = new Resend(KEY)
    const { error } = await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      text: `${params.heading}\n\n${params.body}${params.ctaUrl ? `\n\n${params.ctaLabel}: ${params.ctaUrl}` : ""}\n\n${CLINIC.name}`,
      html: `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
        <div style="max-width:520px;margin:0 auto;padding:24px;">
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;">
            <h1 style="margin:0 0 4px;font-size:18px;">${CLINIC.name}</h1>
            <p style="font-size:15px;margin:16px 0 12px;">${escapeHtml(params.heading)}</p>
            <p style="font-size:15px;margin:0;">${escapeHtml(params.body)}</p>
            ${button}
          </div>
        </div></body></html>`,
    })
    if (error) return { sent: false, error: error.message }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "send_failed" }
  }
}

/** Send a signup email-verification code. Never throws — returns a result. */
export async function sendSignupCodeEmail(params: {
  to: string
  firstName: string
  code: string
}): Promise<{ sent: boolean; error?: string }> {
  if (!KEY) return { sent: false, error: "email_not_configured" }
  if (!params.to?.trim()) return { sent: false, error: "no_recipient" }
  try {
    const resend = new Resend(KEY)
    const { error } = await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: `Your ${CLINIC.name} verification code`,
      text: `Hello ${params.firstName},\n\nYour verification code is: ${params.code}\n\nEnter it to finish creating your account. It expires in 15 minutes.\n\nIf you didn't request this, you can ignore this email.\n\n${CLINIC.name}`,
      html: `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
        <div style="max-width:520px;margin:0 auto;padding:24px;">
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px;">
            <h1 style="margin:0 0 4px;font-size:18px;">${CLINIC.name}</h1>
            <p style="font-size:15px;margin:16px 0 12px;">Hello ${escapeHtml(params.firstName)},</p>
            <p style="font-size:15px;margin:0 0 20px;">Enter this code to finish creating your account:</p>
            <div style="font-size:34px;font-weight:700;letter-spacing:10px;text-align:center;background:#f0f4ff;border:1px solid #dbe4ff;border-radius:12px;padding:18px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(params.code)}</div>
            <p style="font-size:13px;color:#6b7280;margin:20px 0 0;">This code expires in 15 minutes. If you didn't request it, you can ignore this email.</p>
          </div>
        </div></body></html>`,
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
