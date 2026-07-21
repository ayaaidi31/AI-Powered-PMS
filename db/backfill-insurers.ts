/**
 * db/backfill-insurers.ts — one-off backfill of the insurer fields for records
 * created before those fields existed.
 *
 * Two steps:
 *  1. Patients: the seed/demo patients are matched deterministically (by KVNR for
 *     statutory members, by email for the private member) and their insurer name
 *     is set. Remaining insured patients are reported so reception can complete
 *     them from the insurance card.
 *  2. Invoices: older invoices carry no payer snapshot, so their PDF shows no
 *     insurer or KVNR. The snapshot is filled from the linked patient's current
 *     values where missing. This assumes the patient has not switched Kasse since
 *     the invoice was issued, which holds for the existing records; invoices
 *     finalised after the migration already snapshot the payer at issue time.
 *
 * Records only ever move from NULL to a value, so re-running is safe and never
 * overwrites data captured at finalisation or entered at reception.
 *
 * Non-destructive: touches only the `patients` and `invoices` tables and never
 * the LangChain vector tables.
 *
 * Run with:  pnpm db:backfill-insurers
 */
import { pool } from "./_connect"

// Known demo patients: match key -> insurer name.
const BY_KVNR: Record<string, string> = {
  A123456789: "AOK Nordost",
  A987654321: "Techniker Krankenkasse",
  A111222333: "Barmer",
}
const BY_EMAIL: Record<string, string> = {
  "anna.schmidt@email.com": "Allianz Private Krankenversicherung",
}

async function main() {
  let updated = 0

  for (const [kvnr, name] of Object.entries(BY_KVNR)) {
    const res = await pool.query(
      `UPDATE patients SET insurer_name = $1
        WHERE versicherten_id = $2 AND insurer_name IS NULL AND deleted_at IS NULL`,
      [name, kvnr],
    )
    updated += res.rowCount ?? 0
  }
  for (const [email, name] of Object.entries(BY_EMAIL)) {
    const res = await pool.query(
      `UPDATE patients SET insurer_name = $1
        WHERE lower(email) = lower($2) AND insurer_name IS NULL AND deleted_at IS NULL`,
      [name, email],
    )
    updated += res.rowCount ?? 0
  }

  const remaining = await pool.query<{ count: string }>(
    `SELECT count(*)::int AS count FROM patients
      WHERE insurer_name IS NULL AND insurance_type <> 'selbstzahler' AND deleted_at IS NULL`,
  )
  console.log(`[OK] Backfilled insurer for ${updated} patient(s).`)
  console.log(`[INFO] ${remaining.rows[0]?.count ?? 0} insured patient(s) still have no insurer — complete these at reception.`)

  // Fill the payer snapshot on older invoices from their patient, where absent,
  // so their PDF shows the insurer and KVNR like invoices issued after the change.
  const invoiceFill = await pool.query(
    `UPDATE invoices i
        SET insurer_name    = COALESCE(i.insurer_name, p.insurer_name),
            insurer_ik      = COALESCE(i.insurer_ik, p.insurer_ik),
            versicherten_id = COALESCE(i.versicherten_id, p.versicherten_id)
       FROM patients p
      WHERE i.patient_id = p.id
        AND (i.insurer_name IS NULL OR i.versicherten_id IS NULL OR i.insurer_ik IS NULL)
        AND (p.insurer_name IS NOT NULL OR p.versicherten_id IS NOT NULL OR p.insurer_ik IS NOT NULL)`,
  )
  console.log(`[OK] Backfilled payer snapshot on ${invoiceFill.rowCount ?? 0} invoice(s).`)
}

main()
  .catch((err) => {
    console.error("[FAIL] Backfill failed:", err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
