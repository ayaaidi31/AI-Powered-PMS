/**
 * Printable clinic check-in QR poster (Feature 3).
 *
 * Renders a QR code that points at the public `/checkin` page. Print this
 * (Ctrl/Cmd+P) and place it at reception — patients scan it on arrival, then
 * confirm (if signed in) or enter the code from their booking email.
 *
 * The encoded URL comes from APP_URL, so set that to your deployed domain before
 * printing for real use (defaults to http://localhost:3000 for local testing).
 */
import QRCode from "qrcode"
import { appUrl } from "@/lib/email"
import { CLINIC } from "@/lib/clinic"

export const dynamic = "force-dynamic"

export default async function CheckInQrPage() {
  const url = await appUrl("/checkin")
  const qr = await QRCode.toDataURL(url, { width: 360, margin: 2, errorCorrectionLevel: "M" })

  return (
    <div className="min-h-screen bg-white text-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
        <p className="text-sm font-medium tracking-wide text-slate-500 uppercase">{CLINIC.name}</p>
        <h1 className="text-3xl font-bold mt-2 mb-1">Check in here</h1>
        <p className="text-slate-500 mb-6">Scan with your phone camera on arrival</p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Check-in QR code" width={280} height={280} className="mx-auto rounded-xl" />

        <ol className="text-left text-sm text-slate-600 mt-8 space-y-2">
          <li><span className="font-semibold text-slate-900">1.</span> Scan the QR code above.</li>
          <li><span className="font-semibold text-slate-900">2.</span> If you're signed in, tap <em>Confirm arrival</em>.</li>
          <li><span className="font-semibold text-slate-900">3.</span> Otherwise, enter the 6-character code from your booking email.</li>
        </ol>

        <p className="text-xs text-slate-400 mt-8 break-all">{url}</p>
      </div>
    </div>
  )
}
