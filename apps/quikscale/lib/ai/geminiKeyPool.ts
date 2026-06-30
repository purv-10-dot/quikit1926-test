/**
 * Gemini API key pool — round-robin rotation with automatic failover.
 *
 * Why this exists:
 *   The OPSP "Export → Create KPIs" flow runs a Gemini call per exported KPI
 *   to detect semantic-duplicate names (see `semanticKpiMatch.ts`). To spread
 *   load across the free-tier quotas of several keys — and to survive a single
 *   key expiring or being rate-limited — every request is routed through this
 *   pool instead of constructing a client inline.
 *
 * Configuration (env, never hardcoded):
 *   GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3   (1–3 keys; blanks skipped)
 *   GEMINI_MODEL                                            (optional, default below)
 *
 * Rotation:
 *   request 1 → key #1, request 2 → key #2, request 3 → key #3, request 4 → key #1, …
 *   A module-level cursor advances by one per request regardless of how many
 *   failover hops a request needed. The cursor is per serverless instance —
 *   that's fine for load-spreading; it is not (and need not be) shared globally.
 *
 * Failover:
 *   If a key returns 429 (rate limit), 401/403 (invalid/forbidden), or a quota
 *   error, the pool advances to the next key and retries. If every key fails,
 *   it throws `GeminiUnavailableError` — callers treat that as "AI unavailable"
 *   and degrade gracefully (never block the user's action).
 */

import { GoogleGenAI } from "@google/genai";

/** Model id — overridable via env so we can bump it without a code change. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

/**
 * Thrown when no key could service the request (none configured, or all of
 * them failed). Callers catch this to fall back to the no-AI path.
 */
export class GeminiUnavailableError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GeminiUnavailableError";
  }
}

/** Read the configured keys in order, dropping blanks/whitespace. */
function loadKeys(): string[] {
  return [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ]
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k && k.length > 0));
}

// Round-robin pointer. Advances by one per request (see generateContent).
let cursor = 0;

// One client per key — `GoogleGenAI` is cheap but caching avoids re-allocating
// on every request within a warm instance.
const clientCache = new Map<string, GoogleGenAI>();

/**
 * Return a `GoogleGenAI` client. With no argument, returns the client for the
 * key the rotation cursor currently points at (does not advance the cursor).
 * Pass an explicit key to get that key's client.
 *
 * Most callers should prefer `generateContent`, which handles rotation and
 * failover; this is exposed for callers that need raw SDK access.
 */
export function getGeminiClient(apiKey?: string): GoogleGenAI {
  const keys = loadKeys();
  const key = apiKey ?? keys[keys.length ? cursor % keys.length : 0];
  if (!key) {
    throw new GeminiUnavailableError(
      "No Gemini API keys configured (set GEMINI_API_KEY_1..3).",
    );
  }
  let client = clientCache.get(key);
  if (!client) {
    client = new GoogleGenAI({ apiKey: key });
    clientCache.set(key, client);
  }
  return client;
}

/**
 * Classify an error as a "this key is unusable — try the next one" failure:
 * 429 (rate limit), 401/403 (invalid/forbidden key), or a quota-exhaustion
 * error. The SDK surfaces HTTP status on `.status`/`.code`; we also scan the
 * message for the textual quota/auth signals Gemini returns.
 */
export function isKeyFailure(err: unknown): boolean {
  const e = err as { status?: unknown; code?: unknown; message?: unknown } | null;
  const status =
    typeof e?.status === "number"
      ? e.status
      : typeof e?.code === "number"
        ? e.code
        : undefined;
  if (status === 429 || status === 401 || status === 403) return true;

  const msg = (typeof e?.message === "string" ? e.message : "").toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("resource exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("rate-limit") ||
    msg.includes("too many requests") ||
    msg.includes("api key not valid") ||
    msg.includes("api_key_invalid") ||
    msg.includes("permission_denied") ||
    msg.includes("permission denied") ||
    msg.includes("unauthenticated") ||
    msg.includes(" 429") ||
    msg.includes(" 401") ||
    msg.includes(" 403")
  );
}

export interface GenerateOptions {
  /** e.g. "application/json" to coax structured output. */
  responseMimeType?: string;
  /** Optional cancellation signal. */
  signal?: AbortSignal;
}

/**
 * Generate text from `prompt`, rotating across the configured keys and failing
 * over on key errors. Returns the model's text on success.
 *
 * @throws {GeminiUnavailableError} when no key is configured or all keys fail.
 */
export async function generateContent(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const keys = loadKeys();
  if (keys.length === 0) {
    throw new GeminiUnavailableError(
      "No Gemini API keys configured (set GEMINI_API_KEY_1..3).",
    );
  }

  const start = cursor;
  // Advance the cursor up front so the NEXT request moves on by exactly one,
  // independent of how many failover hops this request makes.
  cursor = (start + 1) % keys.length;

  let lastErr: unknown;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (start + attempt) % keys.length;
    const keyNum = idx + 1;
    if (attempt === 0) console.log(`[Gemini] Using key #${keyNum}`);
    else console.log(`[Gemini] Failover to key #${keyNum}`);

    try {
      const ai = getGeminiClient(keys[idx]);
      const res = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          ...(opts.responseMimeType
            ? { responseMimeType: opts.responseMimeType }
            : {}),
          ...(opts.signal ? { abortSignal: opts.signal } : {}),
        },
      });
      const text = res.text;
      if (!text || !text.trim()) {
        throw new Error("Gemini returned an empty response");
      }
      return text;
    } catch (err) {
      lastErr = err;
      // Key errors and transient errors alike: fall through to the next key
      // for resilience. We remember the last error for the final message.
      if (isKeyFailure(err)) continue;
      continue;
    }
  }

  throw new GeminiUnavailableError(
    `All ${keys.length} Gemini API key(s) failed.`,
    lastErr,
  );
}
