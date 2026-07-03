"use server"

/**
 * Patient-document management: uploading, editing, and removing files attached
 * to a patient record (X-ray, MRI, lab results, referrals, prescriptions …).
 *
 * Two roles produce documents:
 *  - the treating doctor (or reception), attaching clinical files during, before,
 *    or after a consultation, optionally linked to the appointment;
 *  - the patient, adding their own files from the portal.
 *
 * The uploader is resolved from the session, never trusted from the form. A
 * patient may only touch their own record. Files are stored as bytea in the
 * database (self-contained prototype); the bytes are served back by the
 * `/api/documents/[id]` route. Removal is a soft delete to honour clinical-record
 * retention (§630f BGB) — the row is hidden, not destroyed.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { sql, query } from "@/lib/db"
import { getSession } from "@/lib/auth/session"
import { getCurrentPatient, getCurrentDoctor, getCurrentReceptionist } from "@/lib/queries"
import { patientName, doctorName } from "@/lib/display"
import type { PatientDocumentRow } from "@/lib/seed-data"
import { ok, fail, type ActionResult } from "./types"

// A single medical scan or report is comfortably under this ceiling; it also
// keeps request bodies within the Server Action limit set in next.config.mjs.
const MAX_BYTES = 15 * 1024 * 1024

// Formats accepted for viewing in the browser or safe download. An empty MIME
// type (common for DICOM exports) is allowed through and capped by size only.
const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/bmp", "image/tiff",
  "application/pdf", "application/dicom",
])

const metaSchema = z.object({
  patient_id: z.string().uuid("A valid patient is required."),
  title: z.string().trim().min(1, "A title is required.").max(200),
  description: z.string().trim().max(2000).optional(),
  category: z.enum([
    "xray", "mri", "ct", "ultrasound", "lab", "prescription", "referral", "discharge", "other",
  ]).default("other"),
  appointment_id: z.string().uuid().optional(),
})

/** Resolve who is acting, and the display name to store against the document. */
async function resolveUploader() {
  const session = await getSession()
  if (!session) return null
  if (session.role === "patient") {
    const p = await getCurrentPatient()
    return p ? { role: "patient" as const, id: p.id, name: patientName(p), patientId: p.id } : null
  }
  if (session.role === "doctor") {
    const d = await getCurrentDoctor()
    return { role: "doctor" as const, id: d?.id ?? null, name: d ? doctorName(d) : "Treating physician", patientId: null }
  }
  if (session.role === "receptionist") {
    const r = await getCurrentReceptionist()
    return { role: "receptionist" as const, id: r?.id ?? null, name: r ? `${r.first_name} ${r.last_name}` : "Reception", patientId: null }
  }
  return null
}

/**
 * Whether an actor may edit or remove a document. Reception administers the
 * record and may manage any file; a doctor or a patient may act only on the
 * documents they uploaded themselves (so one doctor cannot touch another's).
 */
function canManageDocument(
  role: "doctor" | "patient" | "receptionist",
  actorId: string | null,
  doc: { uploaded_by_role: string; uploaded_by_id: string | null },
): boolean {
  if (role === "receptionist") return true
  return doc.uploaded_by_role === role && doc.uploaded_by_id === actorId
}

function revalidateFor(patientId: string) {
  revalidatePath("/patient/documents")
  revalidatePath("/doctor/workspace")
  revalidatePath(`/doctor/patients/${patientId}`)
  revalidatePath(`/receptionist/patients/${patientId}`)
}

/**
 * Upload a document to a patient record. Called with the browser `FormData` so
 * the file streams straight through; the metadata fields ride alongside it.
 */
export async function uploadPatientDocument(formData: FormData): Promise<ActionResult<PatientDocumentRow>> {
  const uploader = await resolveUploader()
  if (!uploader) return fail("Not signed in.")

  const parsed = metaSchema.safeParse({
    patient_id: formData.get("patient_id"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    category: formData.get("category") || undefined,
    appointment_id: formData.get("appointment_id") || undefined,
  })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return fail("Please correct the highlighted fields.", fieldErrors)
  }
  const meta = parsed.data

  // A patient can only attach files to their own record.
  if (uploader.role === "patient" && uploader.patientId !== meta.patient_id) {
    return fail("A document can only be added to the signed-in patient's own record.")
  }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return fail("Please choose a file to upload.")
  if (file.size > MAX_BYTES) return fail("The file is too large (maximum 15 MB).")
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return fail("Unsupported file type. Upload an image, a PDF, or a DICOM file.")
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  const rows = await sql<PatientDocumentRow>`
    INSERT INTO patient_documents (
      patient_id, appointment_id, title, description, category,
      file_name, mime_type, file_size, content,
      uploaded_by_role, uploaded_by_id, uploaded_by_name
    ) VALUES (
      ${meta.patient_id}, ${meta.appointment_id ?? null}, ${meta.title}, ${meta.description ?? null}, ${meta.category},
      ${file.name}, ${file.type || "application/octet-stream"}, ${file.size}, ${bytes},
      ${uploader.role}, ${uploader.id}, ${uploader.name}
    )
    RETURNING id, patient_id, appointment_id, title, description, category,
              file_name, mime_type, file_size, uploaded_by_role, uploaded_by_id,
              uploaded_by_name, created_at, deleted_at`

  revalidateFor(meta.patient_id)
  return ok(rows[0])
}

/** Rename or re-describe an existing document (uploader or clinic staff only). */
export async function updatePatientDocument(
  id: string,
  input: { title?: string; description?: string; category?: PatientDocumentRow["category"] },
): Promise<ActionResult> {
  const uploader = await resolveUploader()
  if (!uploader) return fail("Not signed in.")

  const rows = await sql<{ patient_id: string; uploaded_by_role: string; uploaded_by_id: string | null }>`
    SELECT patient_id, uploaded_by_role, uploaded_by_id
    FROM patient_documents WHERE id = ${id} AND deleted_at IS NULL`
  const doc = rows[0]
  if (!doc) return fail("Document not found.")

  if (!canManageDocument(uploader.role, uploader.id, doc)) {
    return fail("Only the person who uploaded a document (or reception) can edit it.")
  }

  const title = input.title?.trim()
  if (title !== undefined && title.length === 0) return fail("A title is required.")

  const result = await query(
    `UPDATE patient_documents
     SET title = COALESCE($2, title),
         description = COALESCE($3, description),
         category = COALESCE($4, category)
     WHERE id = $1 AND deleted_at IS NULL`,
    [id, title ?? null, input.description?.trim() ?? null, input.category ?? null],
  )
  if (result.rowCount === 0) return fail("Document not found.")

  revalidateFor(doc.patient_id)
  return ok(undefined)
}

/**
 * Remove a document (soft delete). Clinic staff may remove any document on a
 * record; a patient may remove only the ones they uploaded themselves.
 */
export async function deletePatientDocument(id: string): Promise<ActionResult> {
  const uploader = await resolveUploader()
  if (!uploader) return fail("Not signed in.")

  const rows = await sql<{ patient_id: string; uploaded_by_role: string; uploaded_by_id: string | null }>`
    SELECT patient_id, uploaded_by_role, uploaded_by_id
    FROM patient_documents WHERE id = ${id} AND deleted_at IS NULL`
  const doc = rows[0]
  if (!doc) return fail("Document not found.")

  if (!canManageDocument(uploader.role, uploader.id, doc)) {
    return fail("Only the person who uploaded a document (or reception) can remove it.")
  }

  await query(`UPDATE patient_documents SET deleted_at = now() WHERE id = $1`, [id])
  revalidateFor(doc.patient_id)
  return ok(undefined)
}
