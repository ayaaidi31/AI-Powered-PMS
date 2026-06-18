import "server-only"

/**
 * RAG retrieval over the existing pgvector store (Feature 11 — clinical decision
 * support). READ-ONLY: this module only SELECTs from the langchain_pg_* tables
 * created by the embedding pipeline; it never writes or alters them.
 *
 * The chunks were embedded with **BGE** (1024-dim). To run a true vector search
 * the query must be embedded with the SAME model, so the embedder is pluggable:
 *
 *   - If BGE_EMBED_URL is set, we POST the query there to get a BGE vector and do
 *     cosine similarity search (`embedding <=> $vec`). This is where the real RAG
 *     embedding service plugs in later.
 *   - Otherwise we fall back to German full-text search over the chunk text, so
 *     the end-to-end decision-support flow is testable before the embedder is
 *     wired. Mistral's own embeddings are NOT usable here (different vector space).
 *
 * Collection is configurable via RAG_COLLECTION (default: awmf_baseline_bge).
 */
import { query } from "@/lib/db"

const COLLECTION = process.env.RAG_COLLECTION ?? "awmf_baseline_bge"
const EMBED_URL = process.env.BGE_EMBED_URL // optional BGE query-embedding endpoint

export interface RetrievedChunk {
  document: string
  title: string | null
  page: number | null
  source: string | null
  /** Lower = closer for vector distance; higher = better for text rank. */
  score: number | null
  /** "vector" when BGE search ran, "text" for the keyword fallback. */
  via: "vector" | "text"
}

interface Row {
  document: string
  cmetadata: { title?: string; page?: number; source?: string } | null
  score: number | null
}

function toChunk(r: Row, via: "vector" | "text"): RetrievedChunk {
  const m = r.cmetadata ?? {}
  return {
    document: r.document,
    title: m.title ?? null,
    page: m.page ?? null,
    source: m.source ?? null,
    score: r.score,
    via,
  }
}

async function collectionId(): Promise<string | null> {
  const res = await query<{ uuid: string }>(
    `SELECT uuid FROM langchain_pg_collection WHERE name = $1`,
    [COLLECTION],
  )
  return res.rows[0]?.uuid ?? null
}

/** Embed the query with BGE via the configured endpoint; null if not configured. */
async function embedQuery(text: string): Promise<number[] | null> {
  if (!EMBED_URL) return null
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, input: text }),
  })
  if (!res.ok) throw new Error(`Embedding endpoint error ${res.status}`)
  const data = await res.json()
  // Accept a few common shapes: {embedding:[…]}, {vector:[…]}, {data:[{embedding}]}, [[…]]
  const v =
    data.embedding ?? data.vector ?? data?.data?.[0]?.embedding ??
    (Array.isArray(data) ? (Array.isArray(data[0]) ? data[0] : data) : null)
  if (!Array.isArray(v)) throw new Error("Embedding endpoint returned an unexpected shape")
  return v as number[]
}

export interface RetrievalResult {
  chunks: RetrievedChunk[]
  via: "vector" | "text" | "none"
  collection: string
}

/** Retrieve the top-k most relevant guideline chunks for a query. */
export async function retrieveChunks(queryText: string, k = 6): Promise<RetrievalResult> {
  const q = queryText.trim()
  if (!q) return { chunks: [], via: "none", collection: COLLECTION }

  const cid = await collectionId()
  if (!cid) return { chunks: [], via: "none", collection: COLLECTION }

  // 1) True vector search when a BGE embedder is available.
  const vec = await embedQuery(q)
  if (vec) {
    const lit = `[${vec.join(",")}]`
    const res = await query<Row>(
      `SELECT document, cmetadata, (embedding <=> $2::vector) AS score
         FROM langchain_pg_embedding
        WHERE collection_id = $1
        ORDER BY embedding <=> $2::vector
        LIMIT $3`,
      [cid, lit, k],
    )
    return { chunks: res.rows.map((r) => toChunk(r, "vector")), via: "vector", collection: COLLECTION }
  }

  // 2) Fallback: German full-text search over the chunk text.
  const fts = await query<Row>(
    `SELECT document, cmetadata,
            ts_rank(to_tsvector('german', document), websearch_to_tsquery('german', $2)) AS score
       FROM langchain_pg_embedding
      WHERE collection_id = $1
        AND to_tsvector('german', document) @@ websearch_to_tsquery('german', $2)
      ORDER BY score DESC
      LIMIT $3`,
    [cid, q, k],
  )
  if (fts.rows.length) {
    return { chunks: fts.rows.map((r) => toChunk(r, "text")), via: "text", collection: COLLECTION }
  }

  // 3) Last resort: substring match on the first salient words.
  const like = await query<Row>(
    `SELECT document, cmetadata, NULL::float AS score
       FROM langchain_pg_embedding
      WHERE collection_id = $1 AND document ILIKE $2
      LIMIT $3`,
    [cid, `%${q.slice(0, 60)}%`, k],
  )
  return { chunks: like.rows.map((r) => toChunk(r, "text")), via: "text", collection: COLLECTION }
}
