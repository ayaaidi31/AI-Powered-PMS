/**
 * lib/db.ts — single shared PostgreSQL (Neon) connection pool.
 *
 * Reads DATABASE_URL from the environment (.env.local). A single Pool is
 * reused across hot-reloads in dev via a global cache so we don't exhaust
 * Neon's connection limit.
 *
 * Usage:
 *   import { sql, pool } from "@/lib/db"
 *   const rows = await sql<DoctorRow>`SELECT * FROM doctors WHERE id = ${id}`
 */
import { Pool, types, type PoolClient, type QueryResultRow } from "pg"

// Return DATE columns (OID 1082) as plain 'YYYY-MM-DD' strings instead of JS
// Date objects. The application types these as strings (e.g. patient.birth_date)
// and binds them to <input type="date">, so the raw string is what we want;
// keeping the default Date object breaks date inputs and string validation.
types.setTypeParser(1082, (value) => value)

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local (Neon connection string).",
  )
}

// Reuse the pool across hot reloads in development.
const globalForDb = globalThis as unknown as { __pgPool?: Pool }

export const pool: Pool =
  globalForDb.__pgPool ??
  new Pool({
    connectionString,
    // Neon requires SSL; the connection string carries sslmode=require, but we
    // set this explicitly so it also works if the param is ever dropped.
    ssl: { rejectUnauthorized: false },
    max: 10,
  })

if (process.env.NODE_ENV !== "production") globalForDb.__pgPool = pool

/**
 * Tagged-template query helper with parameterized values (SQL-injection safe).
 *   await sql`SELECT * FROM patients WHERE id = ${id}`
 * Interpolated values become $1, $2, … placeholders — never string-concatenated.
 */
export async function sql<T extends QueryResultRow = QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const text = strings.reduce(
    (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""),
    "",
  )
  const res = await pool.query<T>(text, values)
  return res.rows
}

/** Run a raw parameterized query (when you need the full QueryResult). */
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params)
}

/**
 * Run a set of statements inside a single transaction. The callback receives a
 * dedicated client; the transaction is committed if the callback resolves and
 * rolled back if it throws. The client is always released back to the pool.
 *
 * Used for multi-step writes that must be atomic — e.g. booking an appointment
 * after a double-booking check, or allocating a gap-free invoice number.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}
