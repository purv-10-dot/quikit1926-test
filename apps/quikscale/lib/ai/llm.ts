/**
 * The LLM gateway — every model call in the meeting pipeline goes through here.
 *
 * WHY THIS FILE EXISTS, AND WHY NOT `@quikit/ai-sdk`
 * --------------------------------------------------
 * `CLAUDE.md` mandates that AI features go through `@quikit/ai-sdk`. That is
 * deliberately not done here, on the project owner's instruction, and the
 * deviation is recorded in `docs/17-ai-meeting-rhythm-architecture.md` §F.5 and
 * in `apps/quikscale/CLAUDE.md`. The reasons, briefly:
 *
 *   · `@quikit/ai-sdk` is an HTTP client for a "QuikIT AI Runtime" service that
 *     is deployed nowhere in this repository (`services/` contains only
 *     `realtime`). There is no server for it to call.
 *   · It carries no Zod, so it cannot validate the structured output this
 *     pipeline depends on — it only checks that *a* JSON object came back.
 *   · It reports token counts the runtime hands it; it does no local
 *     accounting, so it cannot satisfy the cost-tracking requirement.
 *
 * What this file provides instead is the *intent* of that rule — one place to
 * change models, one place that records cost, one place that sanitises and
 * validates — behind a single seam. If the AI Runtime is ever deployed,
 * swapping to it is a change to this file and nothing else.
 *
 * WHAT IT ADDS OVER `geminiKeyPool`
 * ---------------------------------
 *   · Zod-validated structured output, with ONE repair retry that quotes the
 *     schema violations back to the model at temperature 0.
 *   · Retry with exponential backoff, distinguishing retryable (throttle,
 *     5xx, timeout, empty body) from terminal (schema violation, bad request).
 *   · An `AiUsageLog` row for EVERY call, including failures — a call that
 *     burned input tokens and then timed out still cost money, and cost must
 *     never be invisible.
 *   · Cost in USD computed at call time from `modelPricing.ts`.
 *   · Model tiering: extraction on the cheap model, analysis on the strong one.
 *   · A `traceId` correlating the retries and repair calls of one logical
 *     operation, so a single report's spend is one query.
 *
 * Rate limiting lives one layer down, in `geminiKeyPool`, because that is the
 * only place that knows which API key is about to be used and the provider's
 * ceiling is per key.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §F.3, §F.5, §O.
 */

import { randomUUID } from "node:crypto";

import type { z } from "zod";

import { db } from "@/lib/db";

import {
  GEMINI_MODEL,
  GEMINI_MODEL_ANALYSIS,
  GeminiUnavailableError,
  generateContentDetailed,
  isRateLimit,
  type GeminiUsage,
} from "./geminiKeyPool";
import { costUsd, estimateTokens } from "./modelPricing";
import { RateLimitTimeoutError } from "./rateLimiter";

/**
 * Which pipeline stage a call belongs to. Kept as a closed union so the
 * `AiUsageLog.feature` column stays queryable — free-form strings there would
 * make the cost-per-stage breakdown in `reports/metrics` unreliable.
 */
export type AiFeature =
  | "NORMALIZE"
  | "CHUNK_EXTRACT"
  | "CONSOLIDATE_ADJUDICATE"
  | "EMBED"
  | "VERIFY"
  | "DH_WEEKLY_PROSE"
  | "WM_PROSE"
  | "MONTHLY"
  | "DAILY_REPORT"
  | "SEMANTIC_DUP";

/** Stages that read the client's own words and so get the analysis-tier model. */
const ANALYSIS_FEATURES: ReadonlySet<AiFeature> = new Set<AiFeature>([
  "DH_WEEKLY_PROSE",
  "WM_PROSE",
  "MONTHLY",
  "VERIFY",
]);

export interface LlmCallSpec {
  /** Tenant. Required — every usage row is org-scoped. */
  orgId: string;
  clientId?: string | null;
  feature: AiFeature;
  /**
   * Version of the prompt template. Part of the report cache key, so bumping
   * it marks affected reports stale. Owned by the prompt module, not the caller.
   */
  promptVersion: string;
  prompt: string;

  // ── provenance, for cost attribution ────────────────────────────────────
  transcriptId?: string | null;
  runId?: string | null;
  chunkIdx?: number | null;
  reportKind?: string | null;
  reportId?: string | null;

  // ── model behaviour ────────────────────────────────────────────────────
  /** Explicit override. Otherwise chosen from `feature`. */
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Rate-limit reservation hint; defaults to a length estimate of `prompt`. */
  estTokens?: number;
  signal?: AbortSignal;
  /** Correlates retries/repairs of one logical operation. Generated if absent. */
  traceId?: string;
  /**
   * Total whole-pool attempts, including the first. Default 2.
   *
   * Deliberately low: `geminiKeyPool` already tries every configured key
   * before failing, so an attempt here is a retry of an already-exhausted
   * pool. Each one costs a full prompt, and on a 30-chunk meeting a generous
   * default multiplies into real money for little reliability gain — the queue
   * retries the job anyway.
   */
  maxAttempts?: number;
}

export interface LlmResult<T> {
  /** Validated payload. For `text()` this is the raw string. */
  data: T;
  /** Exactly what the model returned, before parsing. */
  raw: string;
  usage: GeminiUsage;
  costUsd: number;
  model: string;
  /** Whole-pool attempts actually used (1 = first attempt worked). */
  attempts: number;
  /** True when the first response failed validation and a repair call fixed it. */
  repaired: boolean;
  traceId: string;
  latencyMs: number;
}

/** Raised when the model's output could not be made schema-valid. */
export class LlmValidationError extends Error {
  constructor(
    message: string,
    readonly raw: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = "LlmValidationError";
  }
}

/** Raised when every attempt failed for a reason other than validation. */
export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function modelFor(spec: LlmCallSpec): string {
  if (spec.model?.trim()) return spec.model.trim();
  return ANALYSIS_FEATURES.has(spec.feature) ? GEMINI_MODEL_ANALYSIS : GEMINI_MODEL;
}

/**
 * Is this worth another whole-pool attempt?
 *
 * Throttling, transient server errors and empty bodies are; a malformed
 * request or an invalid key is not — retrying those just pays twice for the
 * same failure. `GeminiUnavailableError` means every key failed, which is
 * usually throttling or an outage, so it is retryable once.
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof RateLimitTimeoutError) return false;
  if (err instanceof GeminiUnavailableError) return true;
  if (isRateLimit(err)) return true;

  const e = err as { status?: unknown; code?: unknown; message?: unknown } | null;
  const status =
    typeof e?.status === "number"
      ? e.status
      : typeof e?.code === "number"
        ? e.code
        : undefined;
  if (typeof status === "number" && status >= 500) return true;

  const msg = (typeof e?.message === "string" ? e.message : "").toLowerCase();
  return (
    msg.includes("empty response") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("fetch failed") ||
    msg.includes("unavailable") ||
    msg.includes("internal error")
  );
}

function errorCodeOf(err: unknown): string {
  if (err instanceof RateLimitTimeoutError) return "RATE_LIMIT_TIMEOUT";
  if (err instanceof GeminiUnavailableError) return "ALL_KEYS_FAILED";
  if (err instanceof LlmValidationError) return "INVALID_OUTPUT";
  if (isRateLimit(err)) return "RATE_LIMITED";
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout|timed out|etimedout/i.test(msg)) return "TIMEOUT";
  return "ERROR";
}

const backoffMs = (attempt: number): number =>
  // 1s, 2s, 4s … with jitter, so concurrent chunk jobs do not retry in lockstep.
  Math.min(30_000, 2 ** (attempt - 1) * 1_000) + Math.floor(Math.random() * 400);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pull a JSON value out of a model response.
 *
 * Even with `responseMimeType: "application/json"` the model sometimes wraps
 * output in a ```json fence or prefixes a sentence, so the fence is stripped
 * and, failing that, the outermost balanced brace/bracket span is taken. This
 * mirrors `parseReportResponse` in `meetingReport.ts`, which has handled the
 * same behaviour in production.
 */
export function extractJson(raw: string): unknown {
  const text = raw.trim();

  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  const body = fenced ? fenced[1].trim() : text;

  try {
    return JSON.parse(body);
  } catch {
    // fall through to brace scanning
  }

  const first = body.search(/[[{]/);
  if (first === -1) throw new Error("Model response contained no JSON value");

  const open = body[first];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let escaped = false;

  for (let i = first; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(body.slice(first, i + 1));
    }
  }

  throw new Error("Model response contained unbalanced JSON");
}

/** Flatten Zod issues into short, model-readable lines. */
function issueLines(err: z.ZodError): string[] {
  return err.issues.slice(0, 25).map((i) => {
    const path = i.path.length ? i.path.join(".") : "(root)";
    return `${path}: ${i.message}`;
  });
}

/**
 * Ask the model to fix its own output.
 *
 * The repair prompt carries the violations and the offending response but NOT
 * the original prompt: the model does not need the source material to fix a
 * shape error, and re-sending a chunk of transcript would double the cost of
 * every repair.
 */
function repairPrompt(original: string, raw: string, issues: string[]): string {
  return [
    "Your previous response did not match the required JSON schema.",
    "",
    "Schema violations:",
    ...issues.map((i) => `  - ${i}`),
    "",
    "Your previous response was:",
    "<<<PREVIOUS",
    raw.slice(0, 12_000),
    "PREVIOUS>>>",
    "",
    "Return the SAME information, corrected so it satisfies the schema.",
    "Do not add, invent or remove any facts — fix only the structure.",
    "Respond with JSON only. No prose, no code fences.",
    "",
    "For reference, the original instructions were:",
    "<<<INSTRUCTIONS",
    original.slice(0, 4_000),
    "INSTRUCTIONS>>>",
  ].join("\n");
}

interface UsageRow {
  spec: LlmCallSpec;
  model: string;
  usage: GeminiUsage;
  latencyMs: number;
  queueWaitMs?: number;
  status: string;
  attempt: number;
  errorCode?: string;
  traceId: string;
}

/**
 * Write one `AiUsageLog` row.
 *
 * Failures are swallowed and logged, never thrown — matching the contract of
 * `lib/audit/audit.ts`. A telemetry glitch must not fail a report the user is
 * waiting for. The `void` return is intentional: callers never await this in a
 * way that could reorder the primary work.
 */
async function recordUsage(row: UsageRow): Promise<void> {
  try {
    await db.aiUsageLog.create({
      data: {
        orgId: row.spec.orgId,
        clientId: row.spec.clientId ?? null,
        feature: row.spec.feature,
        model: row.model,
        promptVersion: row.spec.promptVersion,
        transcriptId: row.spec.transcriptId ?? null,
        runId: row.spec.runId ?? null,
        chunkIdx: row.spec.chunkIdx ?? null,
        reportKind: row.spec.reportKind ?? null,
        reportId: row.spec.reportId ?? null,
        inputTokens: row.usage.inputTokens,
        outputTokens: row.usage.outputTokens,
        cachedTokens: row.usage.cachedTokens || null,
        costUsd: costUsd(row.model, row.usage),
        latencyMs: row.latencyMs,
        queueWaitMs: row.queueWaitMs ?? null,
        status: row.status,
        attempt: row.attempt,
        errorCode: row.errorCode ?? null,
        traceId: row.traceId,
      },
    });
  } catch (err) {
    console.error(
      `[ai:usage] failed to record usage for ${row.spec.feature} ` +
        `(trace ${row.traceId}):`,
      err instanceof Error ? err.message : err,
    );
  }
}

const ZERO_USAGE: GeminiUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  totalTokens: 0,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Call the model and return its text, with retries and usage accounting.
 *
 * Prefer `generateStructured` for anything that will be persisted — freeform
 * text cannot be validated, and unvalidated model output must never reach the
 * database (doc 17 §F.3).
 */
export async function generateText(spec: LlmCallSpec): Promise<LlmResult<string>> {
  const traceId = spec.traceId ?? randomUUID();
  const model = modelFor(spec);
  const maxAttempts = Math.max(1, spec.maxAttempts ?? 2);
  const started = Date.now();

  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await generateContentDetailed(spec.prompt, {
        model,
        temperature: spec.temperature,
        maxOutputTokens: spec.maxOutputTokens,
        estTokens: spec.estTokens ?? estimateTokens(spec.prompt),
        signal: spec.signal,
      });

      await recordUsage({
        spec,
        model: res.model,
        usage: res.usage,
        latencyMs: res.latencyMs,
        queueWaitMs: res.rateWaitMs,
        status: "OK",
        attempt,
        traceId,
      });

      return {
        data: res.text,
        raw: res.text,
        usage: res.usage,
        costUsd: costUsd(res.model, res.usage),
        model: res.model,
        attempts: attempt,
        repaired: false,
        traceId,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      lastErr = err;
      await recordUsage({
        spec,
        model,
        usage: ZERO_USAGE,
        latencyMs: Date.now() - started,
        status: isRateLimit(err) ? "RATE_LIMITED" : "ERROR",
        attempt,
        errorCode: errorCodeOf(err),
        traceId,
      });

      if (attempt >= maxAttempts || !isRetryable(err)) break;
      await sleep(backoffMs(attempt));
    }
  }

  throw new LlmUnavailableError(
    `${spec.feature} failed after ${maxAttempts} attempt(s) (trace ${traceId}).`,
    lastErr,
  );
}

/**
 * Call the model and return output validated against `schema`.
 *
 * Flow (doc 17 §F.3):
 *   prompt → JSON mode (+ responseSchema when supplied) → Zod
 *     valid            → return
 *     invalid          → ONE repair call at temperature 0
 *       valid          → return with `repaired: true`
 *       invalid        → LlmValidationError; NOTHING is persisted
 *
 * A repair is attempted once per whole-pool attempt, and a validation failure
 * is terminal for that attempt — retrying a schema error against the same
 * prompt tends to reproduce it, so the caller (a chunk job) should fail and let
 * the queue decide, which keeps the failure visible instead of expensive.
 */
export async function generateStructured<T>(
  spec: LlmCallSpec & {
    /**
     * Output type is T; INPUT is unknown, because what arrives is parsed JSON.
     * Pinning the input to T would reject any schema using `.default()` or
     * `.transform()`, where Zod input and output legitimately differ — and
     * defaults are exactly how an optional section stays schema-valid.
     */
    schema: z.ZodType<T, z.ZodTypeDef, unknown>;
    responseSchema?: Record<string, unknown>;
  },
): Promise<LlmResult<T>> {
  const traceId = spec.traceId ?? randomUUID();
  const model = modelFor(spec);
  const maxAttempts = Math.max(1, spec.maxAttempts ?? 2);
  const started = Date.now();

  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Awaited<ReturnType<typeof generateContentDetailed>>;
    try {
      res = await generateContentDetailed(spec.prompt, {
        model,
        responseMimeType: "application/json",
        responseSchema: spec.responseSchema,
        // Extraction is a transcription task, not a creative one. Determinism
        // also makes the golden-fixture accuracy harness meaningful.
        temperature: spec.temperature ?? 0,
        maxOutputTokens: spec.maxOutputTokens,
        estTokens: spec.estTokens ?? estimateTokens(spec.prompt),
        signal: spec.signal,
      });
    } catch (err) {
      lastErr = err;
      await recordUsage({
        spec,
        model,
        usage: ZERO_USAGE,
        latencyMs: Date.now() - started,
        status: isRateLimit(err) ? "RATE_LIMITED" : "ERROR",
        attempt,
        errorCode: errorCodeOf(err),
        traceId,
      });
      if (attempt >= maxAttempts || !isRetryable(err)) break;
      await sleep(backoffMs(attempt));
      continue;
    }

    // ── first parse ──────────────────────────────────────────────────────
    const first = tryParse(spec.schema, res.text);
    if (first.ok) {
      await recordUsage({
        spec,
        model: res.model,
        usage: res.usage,
        latencyMs: res.latencyMs,
        queueWaitMs: res.rateWaitMs,
        status: "OK",
        attempt,
        traceId,
      });
      return {
        data: first.value,
        raw: res.text,
        usage: res.usage,
        costUsd: costUsd(res.model, res.usage),
        model: res.model,
        attempts: attempt,
        repaired: false,
        traceId,
        latencyMs: Date.now() - started,
      };
    }

    await recordUsage({
      spec,
      model: res.model,
      usage: res.usage,
      latencyMs: res.latencyMs,
      queueWaitMs: res.rateWaitMs,
      status: "INVALID_OUTPUT",
      attempt,
      errorCode: "INVALID_OUTPUT",
      traceId,
    });

    console.warn(
      `[ai:${spec.feature}] schema violation (trace ${traceId}), repairing: ` +
        first.issues.slice(0, 3).join("; "),
    );

    // ── one repair call ──────────────────────────────────────────────────
    try {
      const fix = await generateContentDetailed(
        repairPrompt(spec.prompt, res.text, first.issues),
        {
          model,
          responseMimeType: "application/json",
          responseSchema: spec.responseSchema,
          temperature: 0,
          maxOutputTokens: spec.maxOutputTokens,
          signal: spec.signal,
        },
      );

      const second = tryParse(spec.schema, fix.text);
      const totalUsage: GeminiUsage = {
        inputTokens: res.usage.inputTokens + fix.usage.inputTokens,
        outputTokens: res.usage.outputTokens + fix.usage.outputTokens,
        cachedTokens: res.usage.cachedTokens + fix.usage.cachedTokens,
        totalTokens: res.usage.totalTokens + fix.usage.totalTokens,
      };

      await recordUsage({
        spec,
        model: fix.model,
        usage: fix.usage,
        latencyMs: fix.latencyMs,
        queueWaitMs: fix.rateWaitMs,
        status: second.ok ? "REPAIRED" : "INVALID_OUTPUT",
        attempt,
        errorCode: second.ok ? undefined : "INVALID_OUTPUT_AFTER_REPAIR",
        traceId,
      });

      if (second.ok) {
        return {
          data: second.value,
          raw: fix.text,
          usage: totalUsage,
          costUsd: costUsd(fix.model, totalUsage),
          model: fix.model,
          attempts: attempt,
          repaired: true,
          traceId,
          latencyMs: Date.now() - started,
        };
      }

      // Repair did not help. Terminal — do not burn another full prompt.
      throw new LlmValidationError(
        `${spec.feature} output failed schema validation after repair ` +
          `(trace ${traceId}).`,
        fix.text,
        second.issues,
      );
    } catch (err) {
      if (err instanceof LlmValidationError) throw err;
      lastErr = err;
      await recordUsage({
        spec,
        model,
        usage: ZERO_USAGE,
        latencyMs: Date.now() - started,
        status: "ERROR",
        attempt,
        errorCode: errorCodeOf(err),
        traceId,
      });
      if (attempt >= maxAttempts || !isRetryable(err)) break;
      await sleep(backoffMs(attempt));
    }
  }

  if (lastErr instanceof LlmValidationError) throw lastErr;
  throw new LlmUnavailableError(
    `${spec.feature} failed after ${maxAttempts} attempt(s) (trace ${traceId}).`,
    lastErr,
  );
}

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] };

function tryParse<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  raw: string,
): ParseResult<T> {
  let json: unknown;
  try {
    json = extractJson(raw);
  } catch (err) {
    return {
      ok: false,
      issues: [`(root): ${err instanceof Error ? err.message : "unparseable JSON"}`],
    };
  }

  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, issues: issueLines(parsed.error) };
}
