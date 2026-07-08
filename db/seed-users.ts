/**
 * db/seed-users.ts — creates login accounts for the seeded people.
 *
 * Every doctor and receptionist, and every patient that has an email address,
 * receives a `users` row with the role-appropriate link. All demo accounts use
 * the same password so the prototype can be explored easily.
 *
 *   Demo password (all accounts): demo123
 *
 * Idempotent: re-running updates the password/role for an existing email.
 *
 * Run with:  pnpm db:seed-users   (after pnpm db:migrate && pnpm db:seed)
 */
import { pool } from "./_connect"
import { hashPassword } from "../lib/auth/password"

const DEMO_PASSWORD = "demo123"

async function upsertUser(
  email: string,
  hash: string,
  role: "doctor" | "receptionist" | "patient" | "admin",
  link: { doctor_id?: string; receptionist_id?: string; patient_id?: string },
) {
  await pool.query(
    `INSERT INTO users (email, password_hash, role, doctor_id, receptionist_id, patient_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           doctor_id = EXCLUDED.doctor_id,
           receptionist_id = EXCLUDED.receptionist_id,
           patient_id = EXCLUDED.patient_id`,
    [email, hash, role, link.doctor_id ?? null, link.receptionist_id ?? null, link.patient_id ?? null],
  )
}

async function main() {
  console.log("→ Seeding login accounts …")
  const hash = await hashPassword(DEMO_PASSWORD)

  const doctors = (await pool.query<{ id: string; email: string }>(`SELECT id, email FROM doctors`)).rows
  for (const d of doctors) await upsertUser(d.email, hash, "doctor", { doctor_id: d.id })
  console.log(`  • doctors: ${doctors.length} accounts`)

  const receptionists = (await pool.query<{ id: string; email: string }>(`SELECT id, email FROM receptionists`)).rows
  for (const r of receptionists) await upsertUser(r.email, hash, "receptionist", { receptionist_id: r.id })
  console.log(`  • receptionists: ${receptionists.length} accounts`)

  // Only patients with an email can hold portal credentials (REQ-REC-13).
  const patients = (await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM patients WHERE email IS NOT NULL AND deleted_at IS NULL`,
  )).rows
  for (const p of patients) await upsertUser(p.email, hash, "patient", { patient_id: p.id })
  console.log(`  • patients: ${patients.length} accounts`)

  // Admin account (no role profile) — can provision staff at /admin/staff.
  await upsertUser("admin@clinic.com", hash, "admin", {})
  console.log("  • admin: 1 account (admin@clinic.com)")

  console.log(`✓ Accounts seeded. Demo password for all: "${DEMO_PASSWORD}"`)
}

main()
  .catch((e) => { console.error("✖ Seed-users failed:", e); process.exitCode = 1 })
  .finally(() => pool.end())
