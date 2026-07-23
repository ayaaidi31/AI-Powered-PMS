/**
 * lib/llm/mistral.ts — isolated Mistral API client (temporary).
 *
 * This is the single seam where the language model lives. It is intentionally
 * the only place that talks to an external LLM, so the RAG system being built
 * separately can replace this module without touching the rest of the app.
 *
 * Server-only. Reads MISTRAL_API_KEY (and optional MISTRAL_MODEL) from the
 * environment. Never import from client code.
 */
import "server-only"

const ENDPOINT = "https://api.mistral.ai/v1/chat/completions"
const DEFAULT_MODEL = process.env.MISTRAL_MODEL ?? "mistral-small-latest"

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ChatOptions {
  temperature?: number
  json?: boolean // request a JSON object response
}

/** Returns true when a key is configured, so callers can fail gracefully. */
export function isLlmConfigured(): boolean {
  return Boolean(process.env.MISTRAL_API_KEY)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Single chat completion. Returns the assistant's message text.
 * Throws on missing key or a non-OK response (callers should catch).
 *
 * Transient failures — rate limits (429), server errors (5xx), and network
 * blips — are retried a couple of times with a short backoff, since the hosted
 * model occasionally returns these under load and a bare failure would drop the
 * conversation.
 */
export async function mistralChat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const key = process.env.MISTRAL_API_KEY
  if (!key) throw new Error("MISTRAL_API_KEY is not set in .env.local")

  const body = JSON.stringify({
    model: DEFAULT_MODEL,
    messages,
    temperature: opts.temperature ?? 0.2,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  })

  const maxAttempts = 3
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
      })

      // Retry the request-level transient statuses; surface the rest immediately.
      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
        await sleep(400 * attempt)
        continue
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "")
        throw new Error(`Mistral API error ${res.status}: ${detail.slice(0, 300)}`)
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      return data.choices?.[0]?.message?.content ?? ""
    } catch (err) {
      // Network-level failure — retry, or rethrow on the final attempt.
      lastError = err
      if (attempt >= maxAttempts) break
      await sleep(400 * attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Mistral API request failed")
}
