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

import { sharedRateLimiter } from "./rateLimiter";

/**
 * Model id — overridable via env so we can bump it without a code change.
 *
 * Google retires model ids on a rolling basis: `gemini-2.5-flash` still shows
 * up in the models list but returns 404 "no longer available to new users"
 * for accounts created after its cutoff, which reaches the user as the
 * unhelpful "AI is temporarily unavailable". If that recurs, set GEMINI_MODEL
 * in the environment rather than waiting on a deploy.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

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

/**
 * Analysis-tier model, for the small meeting-level reasoning passes only.
 *
 * Doc 17 section G lever 11: extraction is high-volume and schema-constrained,
 * so it runs on the cheap model. The analysis pass is ONE call with ~4k input
 * tokens whose output the client actually reads, so it is the one place where
 * paying for a stronger model is worth it. Falls back to `GEMINI_MODEL` when
 * unset, which keeps today's behaviour exactly.
 */
export const GEMINI_MODEL_ANALYSIS =
  process.env.GEMINI_MODEL_ANALYSIS?.trim() || GEMINI_MODEL;

export interface GenerateOptions {
  /** e.g. "application/json" to coax structured output. */
  responseMimeType?: string;
  /** Optional cancellation signal. */
  signal?: AbortSignal;
}

/**
 * Extended options for `generateContentDetailed`. Everything here is optional
 * and defaults to the behaviour `generateContent` has always had.
 */
export interface GenerateDetailedOptions extends GenerateOptions {
  /** Override the model — e.g. `GEMINI_MODEL_ANALYSIS` for an L2 pass. */
  model?: string;
  /** JSON Schema for structured output; cuts reparse retries substantially. */
  responseSchema?: Record<string, unknown>;
  /** 0 for extraction and repair, where determinism matters more than variety. */
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Pre-flight token estimate, used to reserve rate-limit budget before the
   * call. Defaults to a length-based estimate of the prompt; pass a better
   * figure when the expected output is large.
   */
  estTokens?: number;
  /** Set false to bypass the rate limiter (tests, one-off admin scripts). */
  rateLimit?: boolean;
}

/** Token counts as the provider reported them. Zeros when unavailable. */
export interface GeminiUsage {
  inputTokens: number;
  outputTokens: number;
  /** Subset of `inputTokens` served from the provider's context cache. */
  cachedTokens: number;
  totalTokens: number;
}

export interface GenerateDetailedResult {
  text: string;
  usage: GeminiUsage;
  /** Which model actually served the request. */
  model: string;
  /** Non-secret key label, e.g. "key#2" — safe to log and to bucket on. */
  keyId: string;
  /** How many keys were tried (1 = first key worked). */
  keyAttempts: number;
  /** Milliseconds spent waiting on the rate limiter. */
  rateWaitMs: number;
  latencyMs: number;
}

/** Stable, non-secret label for a key, by its position in the pool. */
function keyLabel(idx: number): string {
  return `key#${idx + 1}`;
}

/**
 * Read `usageMetadata` defensively.
 *
 * The SDK's field names have shifted across versions and any of them can be
 * absent, so every value is coerced and defaulted. Usage is telemetry: a
 * missing count must never fail a request that otherwise succeeded — it just
 * records zero and the gap shows up in the metrics.
 */
function readUsage(res: unknown): GeminiUsage {
  const meta = (res as { usageMetadata?: Record<string, unknown> } | null)
    ?.usageMetadata;
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;

  const inputTokens = num(meta?.promptTokenCount);
  const outputTokens =
    num(meta?.candidatesTokenCount) || num(meta?.responseTokenCount);
  const cachedTokens = num(meta?.cachedContentTokenCount);
  const totalTokens =
    num(meta?.totalTokenCount) || inputTokens + outputTokens;

  return { inputTokens, outputTokens, cachedTokens, totalTokens };
}

/**
 * Generate content, rotating across keys, failing over on key errors, and
 * returning the provider's token usage alongside the text.
 *
 * This is the low-level call. Most callers should use
 * `lib/ai/llm.ts`, which adds Zod validation, a repair retry, backoff and the
 * `AiUsageLog` write on top. This function's job is narrow: pick a key,
 * respect its rate limit, make one call, report what it cost.
 *
 * Rate limiting lives here rather than in the gateway because this is the only
 * place that knows WHICH key is about to be used, and the provider's ceiling
 * is per key (doc 17 section D.11, gap G16).
 *
 * @throws {GeminiUnavailableError} when no key is configured or all keys fail.
 */
export async function generateContentDetailed(
  prompt: string,
  opts: GenerateDetailedOptions = {},
): Promise<GenerateDetailedResult> {
  const keys = loadKeys();
  if (keys.length === 0) {
    throw new GeminiUnavailableError(
      "No Gemini API keys configured (set GEMINI_API_KEY_1..3).",
    );
  }

  const model = opts.model?.trim() || GEMINI_MODEL;
  const estTokens = opts.estTokens ?? Math.ceil(prompt.length / 4);
  const useLimiter = opts.rateLimit !== false;

  const start = cursor;
  // Advance the cursor up front so the NEXT request moves on by exactly one,
  // independent of how many failover hops this request makes.
  cursor = (start + 1) % keys.length;

  let lastErr: unknown;
  let rateWaitMs = 0;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const idx = (start + attempt) % keys.length;
    const keyId = keyLabel(idx);
    if (attempt === 0) console.log(`[Gemini] Using ${keyId} (${model})`);
    else console.log(`[Gemini] Failover to ${keyId}`);

    const began = Date.now();
    try {
      if (useLimiter) {
        rateWaitMs += await sharedRateLimiter.acquire(keyId, estTokens, {
          signal: opts.signal,
        });
      }

      const ai = getGeminiClient(keys[idx]);
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          ...(opts.responseMimeType
            ? { responseMimeType: opts.responseMimeType }
            : {}),
          ...(opts.responseSchema
            ? { responseSchema: opts.responseSchema as never }
            : {}),
          ...(opts.temperature !== undefined
            ? { temperature: opts.temperature }
            : {}),
          ...(opts.maxOutputTokens !== undefined
            ? { maxOutputTokens: opts.maxOutputTokens }
            : {}),
          ...(opts.signal ? { abortSignal: opts.signal } : {}),
        },
      });

      const text = res.text;
      const usage = readUsage(res);

      // Reconcile the window against what was actually billed, so our
      // 4-chars-per-token estimate does not drift the limiter over time.
      if (useLimiter) {
        sharedRateLimiter.settle(keyId, estTokens, usage.totalTokens || estTokens);
      }

      if (!text || !text.trim()) {
        throw new Error("Gemini returned an empty response");
      }

      return {
        text,
        usage,
        model,
        keyId,
        keyAttempts: attempt + 1,
        rateWaitMs,
        latencyMs: Date.now() - began,
      };
    } catch (err) {
      lastErr = err;
      // A 429 means we were over the real ceiling, whatever our configured
      // one says. Penalise the key so the next window is gentler rather than
      // hammering it again immediately.
      if (useLimiter && isRateLimit(err)) sharedRateLimiter.penalise(keyId);
      // Key errors and transient errors alike: fall through to the next key
      // for resilience. We remember the last error for the final message.
      continue;
    }
  }

  throw new GeminiUnavailableError(
    `All ${keys.length} Gemini API key(s) failed.`,
    lastErr,
  );
}

/**
 * Narrower than `isKeyFailure`: specifically "we were throttled", as opposed
 * to "this key is invalid". Only throttling should trigger the adaptive
 * concurrency penalty — halving throughput because a key was revoked would
 * punish the healthy keys for a config error.
 */
export function isRateLimit(err: unknown): boolean {
  const e = err as { status?: unknown; code?: unknown; message?: unknown } | null;
  const status =
    typeof e?.status === "number"
      ? e.status
      : typeof e?.code === "number"
        ? e.code
        : undefined;
  if (status === 429) return true;

  const msg = (typeof e?.message === "string" ? e.message : "").toLowerCase();
  return (
    msg.includes("resource_exhausted") ||
    msg.includes("resource exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("rate-limit") ||
    msg.includes("too many requests") ||
    msg.includes("quota") ||
    msg.includes(" 429")
  );
}

/**
 * Generate text from `prompt`, rotating across the configured keys and failing
 * over on key errors. Returns the model's text on success.
 *
 * Thin wrapper over `generateContentDetailed` — kept so existing callers
 * (`meetingReport.ts`, `weeklyHuddleReport.ts`, `semanticKpiMatch.ts`) are
 * unchanged. They gain rate limiting for free; they do not get usage counts,
 * which is why new code should go through `lib/ai/llm.ts` instead.
 *
 * @throws {GeminiUnavailableError} when no key is configured or all keys fail.
 */
export async function generateContent(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const res = await generateContentDetailed(prompt, opts);
  return res.text;
}
