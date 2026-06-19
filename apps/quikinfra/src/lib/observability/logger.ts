/**
 * Structured Logger
 *
 * JSON-lines output — one log line = one object. Machine-parseable,
 * suitable for shipping to Datadog / Elastic / CloudWatch / Loki without
 * additional formatting.
 *
 * Contract:
 *   - Every line has: ts, level, msg, requestId?, orgId?, userId?, ...
 *   - `msg` is a short stable identifier (e.g. "domain_error", "dpr_approved").
 *     Don't interpolate values into it — pass them as structured fields.
 *   - Secrets, SQL, stack traces from unknown errors are NEVER logged at
 *     info/warn. Only `logger.error({ err })` captures stacks, and those
 *     are also forwarded to Sentry where they're protected.
 *
 * Usage:
 *   import { logger } from "@/lib/observability/logger";
 *
 *   logger.info({ msg: "grn_approved", grnId, lineCount: 5 });
 *   logger.warn({ msg: "domain_error", code: "EXCEEDS_TENDER", details });
 *   logger.error({ msg: "unhandled_error", err });
 *
 * Design notes:
 *   - No external dep (pino/winston) — Next's bundler + Edge runtime make
 *     those awkward. A plain stdout JSON writer is enough for Phase 5.
 *   - Structured context is attached via the `headers()` API when
 *     available — the request id set by middleware is picked up
 *     automatically without every caller having to thread it through.
 *   - Level filtering via `LOG_LEVEL` env: debug | info | warn | error.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase() as Level;
  return LEVELS[raw] ?? LEVELS.info;
}

function currentRequestId(): string | undefined {
  // `headers()` from next/headers only works inside a request scope. In
  // service-layer code called outside a request (scripts, cron), it
  // throws — swallow and return undefined. Webpack's RSC bundler doesn't
  // expose `require` on the server runtime so we use a top-level import
  // with a try/catch instead of the indirect-require trick.
  try {
    const { headers } = requireNextHeaders();
    return headers().get("x-request-id") ?? undefined;
  } catch {
    return undefined;
  }
}

// Deferred loader for next/headers. We use a plain top-level dynamic
// import resolved lazily so the module only loads inside a request scope.
let _nextHeaders: typeof import("next/headers") | null = null;
function requireNextHeaders(): typeof import("next/headers") {
  if (_nextHeaders) return _nextHeaders;
  _nextHeaders = require("next/headers");
  return _nextHeaders!;
}

/**
 * Serialize an Error-like value for JSON logging. Preserves name, message,
 * stack, code, and any enumerable own properties (DomainError.details).
 */
function serializeErr(err: unknown): unknown {
  if (!err) return err;
  if (err instanceof Error) {
    const out: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
    for (const k of Object.keys(err)) {
      out[k] = (err as unknown as Record<string, unknown>)[k];
    }
    return out;
  }
  return err;
}

function emit(level: Level, entry: Record<string, unknown>): void {
  if (LEVELS[level] < currentLevel()) return;

  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    ...entry,
  };

  // Attach request id if we're in a request scope and the caller didn't
  // set one explicitly.
  if (line.requestId === undefined) {
    const rid = currentRequestId();
    if (rid) line.requestId = rid;
  }

  // Error serialization
  if (line.err !== undefined) {
    line.err = serializeErr(line.err);
  }

  // JSON-lines — one object per line.
  const json = JSON.stringify(line);
  if (level === "error") {
    // Route to stderr for CloudWatch / Docker log routing
    process.stderr.write(json + "\n");
  } else {
    process.stdout.write(json + "\n");
  }
}

export const logger = {
  debug: (entry: Record<string, unknown>) => emit("debug", entry),
  info: (entry: Record<string, unknown>) => emit("info", entry),
  warn: (entry: Record<string, unknown>) => emit("warn", entry),
  error: (entry: Record<string, unknown>) => emit("error", entry),

  /**
   * Build a child logger that carries context fields on every call. Useful
   * inside a service to avoid repeating `{ orgId, userId }`.
   *
   *   const log = logger.with({ orgId, userId, module: "boq" });
   *   log.info({ msg: "lock_applied", projectId });
   */
  with(context: Record<string, unknown>) {
    return {
      debug: (entry: Record<string, unknown>) => emit("debug", { ...context, ...entry }),
      info: (entry: Record<string, unknown>) => emit("info", { ...context, ...entry }),
      warn: (entry: Record<string, unknown>) => emit("warn", { ...context, ...entry }),
      error: (entry: Record<string, unknown>) => emit("error", { ...context, ...entry }),
    };
  },
};
