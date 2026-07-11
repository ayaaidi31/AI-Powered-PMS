/**
 * db/seed.ts — loads the demo data from lib/seed-data.ts into Postgres.
 *
 * The seed file uses readable string ids ("doc-1", "pat-1", "apt-3"). Real
 * uuids are generated here, with a map from each seed id → uuid so foreign keys
 * resolve correctly across tables.
 *
 * Idempotent: TRUNCATEs ONLY the application tables (explicitly listed — the
 * LangChain RAG tables langchain_pg_embedding / langchain_pg_collection are
 * never named and never touched), then re-inserts.
 *
 * Run with:  pnpm db:seed   (assumes pnpm db:migrate has been run first)
 */
import { randomUUID } from "node:crypto"
import { pool } from "./_connect"
import * as seed from "../lib/seed-data"
import { generateCheckInCode } from "../lib/check-in-code"

// seed-id → uuid maps
const docId = new Map<string, string>()
const patId = new Map<string, string>()
const apptId = new Map<string, string>()
const reportId = new Map<string, string>()
const invId = new Map<string, string>()

function uuidFor(map: Map<string, string>, key: string): string {
  let v = map.get(key)
  if (!v) {
    v = randomUUID()
    map.set(key, v)
  }
  return v
}

// App tables in child→parent order. Deletion runs in this order (NOT TRUNCATE)
// so unrelated pre-existing tables are never touched (patient/encounter/condition
// from the old FHIR schema, or the langchain_pg_* RAG tables). DELETE also
// safely refuses if external rows ever reference these lookup tables.
const APP_TABLES = [
  "invoices",
  "report_billing_codes",
  "medical_reports",
  "vitals",
  "appointments",
  "surgeries",
  "medications",
  "patient_conditions",
  "patient_allergies",
  "patients",
  "doctors",
  "receptionists",
  "medication_pzn",
  "goae_catalog",
  "ebm_catalog",
  "icd_10_gm",
]

/** Insert an array of row objects into `table`, using the given column order. */
async function insert(table: string, columns: string[], rows: readonly object[]) {
  if (rows.length === 0) return
  const colList = columns.join(", ")
  for (const row of rows) {
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ")
    const r = row as Record<string, unknown>
    const values = columns.map((c) => r[c])
    await pool.query(
      `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`,
      values,
    )
  }
  console.log(`  • ${table}: ${rows.length} rows`)
}

async function main() {
  console.log("→ Seeding demo data …")
  await pool.query("BEGIN")
  try {
    // Clear the application tables in child→parent order (idempotent re-seed).
    for (const t of APP_TABLES) await pool.query(`DELETE FROM ${t}`)

    // ── Lookup tables (natural text keys) ──
    await insert("icd_10_gm", ["code", "description"], seed.icd_10_gm)
    await insert(
      "ebm_catalog",
      ["code", "description", "fee_in_cents"],
      seed.ebm_catalog,
    )
    await insert(
      "goae_catalog",
      ["code", "description", "base_cents", "default_multiplier"],
      seed.goae_catalog,
    )
    await insert(
      "medication_pzn",
      ["pzn_code", "name", "active_ingredient"],
      seed.medication_pzn,
    )

    // ── People ──
    await insert(
      "doctors",
      ["id", "first_name", "last_name", "email", "phone", "specialization", "lanr", "department", "max_daily_capacity", "is_available"],
      seed.doctors.map((d) => ({ ...d, id: uuidFor(docId, d.id) })),
    )
    await insert(
      "receptionists",
      ["id", "first_name", "last_name", "email", "phone", "department"],
      seed.receptionists.map((r) => ({ ...r, id: randomUUID() })),
    )
    await insert(
      "patients",
      ["id", "first_name", "last_name", "birth_date", "email", "phone", "insurance_type", "versicherten_id", "is_digital_active", "guardian_contact", "street", "city", "postal_code", "country", "last_updated_by", "created_at", "deleted_at"],
      seed.patients.map((p) => ({ ...p, id: uuidFor(patId, p.id) })),
    )

    // ── Patient clinical child tables ──
    await insert(
      "patient_allergies",
      ["id", "patient_id", "substance", "recorded_at"],
      seed.patient_allergies.map((a) => ({ ...a, id: randomUUID(), patient_id: patId.get(a.patient_id) })),
    )
    await insert(
      "patient_conditions",
      ["id", "patient_id", "icd10_code", "label", "recorded_at"],
      seed.patient_conditions.map((c) => ({ ...c, id: randomUUID(), patient_id: patId.get(c.patient_id) })),
    )
    await insert(
      "medications",
      ["id", "patient_id", "pzn_code", "name", "dosage", "frequency", "start_date", "end_date"],
      seed.medications.map((m) => ({ ...m, id: randomUUID(), patient_id: patId.get(m.patient_id) })),
    )
    await insert(
      "surgeries",
      ["id", "patient_id", "name", "surgery_date", "notes"],
      seed.surgeries.map((s) => ({ ...s, id: randomUUID(), patient_id: patId.get(s.patient_id) })),
    )

    // ── Scheduling / clinical events ──
    await insert(
      "appointments",
      ["id", "patient_id", "doctor_id", "starts_at", "duration_min", "status", "reason", "reason_for_change", "check_in_at", "doctor_notes", "created_at", "check_in_code"],
      seed.appointments.map((a) => ({
        ...a,
        id: uuidFor(apptId, a.id),
        patient_id: patId.get(a.patient_id),
        doctor_id: docId.get(a.doctor_id),
        // Only live (scheduled/waiting) visits carry a usable code.
        check_in_code: a.status === "scheduled" || a.status === "waiting" ? generateCheckInCode() : null,
      })),
    )
    await insert(
      "vitals",
      ["id", "patient_id", "appointment_id", "recorded_at", "height_cm", "weight_kg", "systolic", "diastolic", "heart_rate", "temperature_c"],
      seed.vitals.map((v) => ({
        ...v,
        id: randomUUID(),
        patient_id: patId.get(v.patient_id),
        appointment_id: v.appointment_id ? apptId.get(v.appointment_id) : null,
      })),
    )
    await insert(
      "medical_reports",
      ["id", "appointment_id", "patient_id", "doctor_id", "diagnosis", "raw_notes", "formatted_report", "internal_notes", "status", "approved_at", "version", "created_at"],
      seed.medical_reports.map((r) => ({
        ...r,
        id: uuidFor(reportId, r.id),
        appointment_id: apptId.get(r.appointment_id),
        patient_id: patId.get(r.patient_id),
        doctor_id: docId.get(r.doctor_id),
      })),
    )
    await insert(
      "report_billing_codes",
      ["id", "report_id", "catalog", "code", "multiplier"],
      seed.report_billing_codes.map((b) => ({ ...b, id: randomUUID(), report_id: reportId.get(b.report_id) })),
    )
    await insert(
      "invoices",
      ["id", "invoice_number", "appointment_id", "patient_id", "insurance_type", "total_cents", "status", "storno_of", "due_date", "created_at"],
      seed.invoices.map((i) => ({
        ...i,
        id: uuidFor(invId, i.id),
        appointment_id: apptId.get(i.appointment_id),
        patient_id: patId.get(i.patient_id),
        storno_of: i.storno_of ? invId.get(i.storno_of) : null,
      })),
    )

    await pool.query("COMMIT")
    console.log("[OK] Seed complete.")
  } catch (err) {
    await pool.query("ROLLBACK")
    throw err
  }
}

main()
  .catch((err) => {
    console.error("[FAIL] Seed failed:", err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
