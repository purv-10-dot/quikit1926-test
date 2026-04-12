/**
 * @quikit/logger — structured JSON logger for the QuikIT monorepo.
 *
 * Wraps pino with a default configuration tuned for Next.js:
 *   - JSON output in production (for log aggregation pipelines)
 *   - Pretty-printed in development (for human readability)
 *   - Default fields: `service`, `env`
 *   - `createLogger(name)` for per-module loggers
 *   - `requestLogger(req)` for per-request context (tenantId, userId, requestId)
 *
 * Usage:
 *   import { logger } from "@quikit/logger";
 *   logger.info({ userId, tenantId }, "KPI created");
 *   logger.error({ err }, "Failed to save weekly value");
 */

import pino from "pino";

const isDev = process.env.NODE_ENV === "development";

/**
 * Root logger instance. Used directly or via `createLogger(name)`.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  ...(isDev
    ? {
        transport: {
          target: "pino/file",
          options: { destination: 1 }, // stdout
        },
      }
    : {}),
  base: {
    service: "quikscale",
    env: process.env.NODE_ENV ?? "development",
  },
  // Redact sensitive fields if they appear in log objects
  redact: {
    paths: ["password", "token", "secret", "authorization", "cookie"],
    censor: "[REDACTED]",
  },
  // Serialize errors with stack traces
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with a module name for filtering.
 *
 * Usage:
 *   const log = createLogger("kpi");
 *   log.info({ kpiId }, "Weekly value saved");
 */
export function createLogger(module: string) {
  return logger.child({ module });
}

/**
 * Create a request-scoped logger with tenantId, userId, and requestId.
 *
 * Usage in API routes:
 *   const log = requestLogger({ tenantId, userId, requestId: req.headers.get("x-request-id") });
 *   log.info("Processing KPI update");
 */
export function requestLogger(context: {
  tenantId?: string;
  userId?: string;
  requestId?: string | null;
}) {
  return logger.child({
    tenantId: context.tenantId,
    userId: context.userId,
    requestId: context.requestId ?? undefined,
  });
}

export type Logger = pino.Logger;
