/**
 * Streams the bytes of a single patient document (imaging, lab result, …).
 *
 * Access follows the same rule as the rest of the record: clinic staff (doctor
 * or receptionist) may open any patient's document, and a patient may open only
 * documents on their own record. Images and PDFs are served inline so they open
 * in the browser; adding `?download=1` forces a save-as instead.
 */
import { getSession } from "@/lib/auth/session"
import { getPatientDocumentBlob } from "@/lib/queries"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await getSession()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const doc = await getPatientDocumentBlob(id)
  if (!doc) return new Response("Not found", { status: 404 })

  const isOwnRecord = session.role === "patient" && session.profileId === doc.patient_id
  const isReception = session.role === "receptionist"
  // A doctor may open the patient's own uploads and their own files, but not a
  // file another doctor uploaded — the same rule the record listing applies.
  const isPermittedDoctor =
    session.role === "doctor" &&
    (doc.uploaded_by_role !== "doctor" || doc.uploaded_by_id === session.profileId)
  if (!isOwnRecord && !isReception && !isPermittedDoctor) {
    return new Response("Forbidden", { status: 403 })
  }

  const wantsDownload = new URL(req.url).searchParams.has("download")
  const disposition = wantsDownload ? "attachment" : "inline"

  return new Response(new Uint8Array(doc.content), {
    headers: {
      "Content-Type": doc.mime_type || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(doc.file_name)}"`,
      "Content-Length": String(doc.content.length),
      "Cache-Control": "private, no-store",
    },
  })
}
