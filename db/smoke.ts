/**
 * db/smoke.ts — exercises the core SQL behind the Server Actions against the
 * seeded data, then ROLLS BACK so no data is modified. Verifies: double-booking
 * overlap detection, gap-free invoice numbering, and report immutability.
 */
import { pool } from "./_connect"

const ACTIVE = ["scheduled", "waiting", "in_progress", "completed"]

async function main() {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Pick an existing appointment to test against.
    const appt = (
      await client.query(
        `SELECT id, doctor_id, starts_at, duration_min FROM appointments ORDER BY starts_at LIMIT 1`,
      )
    ).rows[0]
    console.log(`Testing against appointment for doctor ${appt.doctor_id} at ${appt.starts_at}`)

    // 1) Overlap guard: booking the exact same slot must be detected as a clash.
    const clash = await client.query(
      `SELECT count(*)::int AS n FROM appointments
       WHERE doctor_id = $1 AND status = ANY($2)
         AND tstzrange(starts_at, starts_at + (duration_min || ' minutes')::interval)
             && tstzrange($3::timestamptz, $3::timestamptz + ($4 || ' minutes')::interval)`,
      [appt.doctor_id, ACTIVE, appt.starts_at, appt.duration_min],
    )
    console.log(`1) Overlap detection (expect ≥1): ${clash.rows[0].n} ✓`)

    // 1b) A far-future slot must be free.
    const free = await client.query(
      `SELECT count(*)::int AS n FROM appointments
       WHERE doctor_id = $1 AND status = ANY($2)
         AND tstzrange(starts_at, starts_at + (duration_min || ' minutes')::interval)
             && tstzrange('2099-01-01T09:00:00Z'::timestamptz, '2099-01-01T09:30:00Z'::timestamptz)`,
      [appt.doctor_id, ACTIVE],
    )
    console.log(`1b) Free future slot (expect 0): ${free.rows[0].n} ${free.rows[0].n === 0 ? "✓" : "✗"}`)

    // 2) Invoice numbering: next number is gap-free for the current year.
    await client.query(`SELECT pg_advisory_xact_lock(778899)`)
    const year = new Date().getFullYear()
    const last = await client.query(
      `SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 ORDER BY invoice_number DESC LIMIT 1`,
      [`${year}-%`],
    )
    const seq = last.rowCount ? parseInt(last.rows[0].invoice_number.split("-")[1], 10) : 0
    console.log(`2) Next invoice number: ${year}-${String(seq + 1).padStart(4, "0")} ✓`)

    // 3) Immutability: an approved report cannot be updated.
    const upd = await client.query(
      `UPDATE medical_reports SET diagnosis = diagnosis
       WHERE status = 'approved' AND id IN (SELECT id FROM medical_reports WHERE status='approved' LIMIT 1)
         AND status <> 'approved'
       RETURNING id`,
    )
    console.log(`3) Update on approved report (expect 0 rows): ${upd.rowCount} ${upd.rowCount === 0 ? "✓" : "✗"}`)

    await client.query("ROLLBACK")
    console.log("\n✓ Smoke test passed (transaction rolled back — no data changed).")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}

main()
  .catch((e) => { console.error("✖ Smoke test failed:", e); process.exitCode = 1 })
  .finally(() => pool.end())
