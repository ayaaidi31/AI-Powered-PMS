/** db/inspect.ts — read-only: lists existing tables, row counts, and FKs. */
import { pool } from "./_connect"

async function main() {
  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE'
     ORDER BY table_name`,
  )
  console.log(`\nPublic tables (${tables.rows.length}):`)
  for (const { table_name } of tables.rows) {
    let count = "?"
    try {
      const r = await pool.query(`SELECT count(*)::int AS c FROM "${table_name}"`)
      count = String(r.rows[0].c)
    } catch {
      count = "(err)"
    }
    console.log(`  ${table_name.padEnd(28)} ${count.padStart(6)} rows`)
  }

  const fks = await pool.query<{ child: string; parent: string }>(
    `SELECT tc.table_name AS child, ccu.table_name AS parent
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
     ORDER BY parent, child`,
  )
  console.log(`\nForeign keys (child → parent):`)
  for (const f of fks.rows) console.log(`  ${f.child} → ${f.parent}`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => pool.end())
