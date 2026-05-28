/**
 * DomainError — common base for every structured error class in the app.
 *
 * All module-specific error classes (BOQError, StockError, FileError,
 * ApprovalError, TransitionError, PurchaseValidationError, etc.) should
 * extend DomainError. Route handlers catch DomainError once and map to the
 * canonical envelope via `toHttpResponse(err)`.
 *
 * Contract:
 *   - `code` — stable machine-readable identifier (e.g. "EXCEEDS_TENDER").
 *              Never changes once published. Clients and audit logs key on this.
 *   - `message` — human-readable. Safe to show to end-users; never contains
 *                 secrets, SQL, stack frames, or file paths.
 *   - `status` — HTTP status code (400/403/404/409/410/422/423).
 *   - `details` — structured metadata about the error (e.g. which line
 *                 exceeded, what the cap was). Also safe for clients.
 *   - `isOperational` — true by default. Operational errors are expected
 *                       (user did something wrong). They log at WARN.
 *                       Non-operational = bug in our code; log at ERROR
 *                       and forward to Sentry.
 *
 * See existing implementers:
 *   - src/lib/boq/service.ts        → BOQError
 *   - src/lib/stock/ledger-service.ts → StockError
 *   - src/lib/storage/file-service.ts → FileError
 *   - src/lib/workflow/transitions.ts → TransitionError
 *   - src/lib/approvals/approval-service.ts → ApprovalConflictError / ApprovalPermissionError / ApprovalStateError
 *   - src/lib/boq/progress-ledger.ts → ProgressLedgerError
 *   - src/lib/boq/billing-ledger.ts  → BillingLedgerError
 *   - src/lib/workflow/audit.ts      → ApprovalActionError
 */

import { NextResponse } from "next/server";
import { err as envelopeErr, ok as envelopeOk } from "./envelope";

export class DomainError extends Error {
  code: string;
  httpStatus: number;
  details?: Record<string, unknown>;
  /** Expected / user-caused errors log at warn; unexpected bugs log at error. */
  isOperational: boolean;

  constructor(
    code: string,
    message: string,
    httpStatus = 400,
    options: { details?: Record<string, unknown>; isOperational?: boolean } = {}
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
  }
}

/**
 * Type guard for DomainError-shaped errors. Uses duck-typing so existing
 * module error classes (BOQError, StockError, ...) are recognized even if
 * they haven't been formally refactored to extend DomainError yet. The
 * migration is incremental: new code extends DomainError, existing classes
 * remain compatible via the shape check.
 */
export function isDomainError(err: unknown): err is DomainError {
  if (err instanceof DomainError) return true;
  if (!err || typeof err !== "object") return false;
  const e = err as any;
  return typeof e.code === "string" && typeof e.httpStatus === "number" && typeof e.message === "string";
}

/**
 * Map any error to a canonical error response. Use at the top of every
 * route handler's catch block:
 *
 *   } catch (err) {
 *     return toHttpResponse(err);
 *   }
 *
 * Unknown errors (not DomainError-shaped) map to 500 with a generic message
 * — the original is logged + forwarded to Sentry but never leaked to the
 * client.
 */
export function toHttpResponse(error: unknown): NextResponse {
  // Lazy-import logger + sentry to avoid circular imports
  const { logger } = require("@/lib/observability/logger") as typeof import("@/lib/observability/logger");
  const { captureException } = require("@/lib/observability/sentry") as typeof import("@/lib/observability/sentry");

  if (isDomainError(error)) {
    const e = error as DomainError;
    if (e.isOperational !== false) {
      logger.warn({
        msg: "domain_error",
        code: e.code,
        status: e.httpStatus,
        details: e.details,
      });
    } else {
      logger.error({ msg: "non_operational_domain_error", code: e.code, err: e });
      captureException(e);
    }
    return envelopeErr(e.code, e.message, e.httpStatus, e.details);
  }

  // Unknown → 500. Never leak the original message to the client.
  logger.error({
    msg: "unhandled_error",
    err: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
  });
  captureException(error);
  return envelopeErr(
    "INTERNAL_ERROR",
    "An internal error occurred. The incident has been logged.",
    500
  );
}

// Re-export envelope helpers so handlers only need one import
export { envelopeOk as ok };
