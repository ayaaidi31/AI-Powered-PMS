/**
 * db/backfill-insurers.ts — one-off backfill of the insurer name for existing
 * patient records created before the field was introduced.
 *
 * Only the seed/demo patients can be matched deterministically (by their KVNR
 * for statutory members, by email for the private member), so those are set
 * here. Records only ever move from NULL to a value, so re-running is safe and
 * never overwrites data entered at reception. Any remaining patients without an
 * insurer are reported at the end; their Krankenkasse is not derivable and must
 * be completed from the insurance card at reception.
 *
 * Non-destructive: touches only the `patients` table and never the LangChain
 * vector tables.
 *
 * Run with:  pnpm tsx db/backfill-insurers.ts   (or the project's script runner)
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
}

main()
  .catch((err) => {
    console.error("[FAIL] Backfill failed:", err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
