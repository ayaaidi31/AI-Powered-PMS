/**
 * db/migrate.ts — applies db/schema.sql to the database.
 *
 * Non-destructive: schema.sql uses CREATE TABLE IF NOT EXISTS only and never
 * references the LangChain tables (langchain_pg_embedding / _collection).
 *
 * Run with:  pnpm db:migrate
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { pool } from "./_connect"

async function main() {
  for (const file of ["schema.sql", "auth-schema.sql"]) {
    const sql = readFileSync(join(process.cwd(), "db", file), "utf8")
    console.log(`→ Applying db/${file} …`)
    await pool.query(sql)
  }
  console.log("✓ Schema applied (tables created if not already present).")
}

main()
  .catch((err) => {
    console.error("✖ Migration failed:", err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
