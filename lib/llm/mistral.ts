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

  const maxAttempts = 5
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
      })

      // Retry the request-level transient statuses; surface the rest immediately.
      // Rate limits (429) and hosted-model capacity exhaustion are common on the
      // shared tier, so back off longer for those, honouring Retry-After when set.
      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
        const retryAfter = Number(res.headers.get("retry-after"))
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : (res.status === 429 ? 1500 : 500) * attempt
        await sleep(backoff)
        continue
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "")
        // The capacity error is provider-side and transient; give a message the
        // caller can show without exposing the raw JSON payload.
        if (res.status === 429) {
          throw new Error("The AI service is temporarily at capacity. Please try again in a moment.")
        }
        throw new Error(`Mistral API error ${res.status}: ${detail.slice(0, 300)}`)
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      return data.choices?.[0]?.message?.content ?? ""
    } catch (err) {
      // Network-level failure — retry, or rethrow on the final attempt.
      lastError = err
      if (attempt >= maxAttempts) break
      await sleep(500 * attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Mistral API request failed")
}
