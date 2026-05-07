/**
 * Map Prisma's known error codes to user-friendly DomainErrors.
 *
 * Each mutating route ends up writing the same try/catch with these codes.
 * Centralising the mapping means a `P2002` from a vendor create vs an item
 * create produce the same shape — and routes can `throw new DomainError`
 * for everything else, with one final catch using `toHttpResponse`.
 *
 * Codes covered (most common only — the long tail still falls through to
 * `toHttpResponse`'s generic 500):
 *
 *   P2002  unique constraint     → 409 DUPLICATE
 *   P2003  FK violation          → 400 INVALID_REFERENCE
 *   P2025  not found / record DNE → 404 NOT_FOUND
 *
 * Usage:
 *
 *   try {
 *     return await db.cnVendor.create({ data });
 *   } catch (e) {
 *     throw mapPrismaError(e, "vendor");
 *   }
 *
 *   // Or inside withMutationRoute, the wrapper does this for you.
 */

import { DomainError } from "./errors";

interface PrismaLikeError {
  code?: string;
  meta?: { target?: string[] | string; cause?: string };
  message?: string;
}

function isPrismaError(err: unknown): err is PrismaLikeError {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as any).code === "string" &&
    (err as any).code.startsWith("P")
  );
}

/** Pretty-print the column(s) that broke a unique constraint. */
function targetField(meta: PrismaLikeError["meta"]): string {
  const t = meta?.target;
  if (!t) return "this value";
  if (Array.isArray(t)) return t.join(", ");
  return String(t);
}

/**
 * Convert a Prisma error to a DomainError. Returns the input unchanged if
 * it isn't a Prisma error (so callers can `throw mapPrismaError(e)` and
 * preserve their own DomainErrors / non-Prisma exceptions).
 */
export function mapPrismaError(err: unknown, entityLabel = "record"): unknown {
  if (!isPrismaError(err)) return err;

  switch (err.code) {
    case "P2002": {
      const field = targetField(err.meta);
      return new DomainError(
        "DUPLICATE",
        `A ${entityLabel} with the same ${field} already exists.`,
        409,
        { details: { target: err.meta?.target ?? null } },
      );
    }
    case "P2003":
      return new DomainError(
        "INVALID_REFERENCE",
        `Referenced ${entityLabel} or related entity does not exist.`,
        400,
        { details: { target: err.meta?.target ?? null } },
      );
    case "P2025":
      return new DomainError(
        "NOT_FOUND",
        `The ${entityLabel} you tried to update or delete was not found.`,
        404,
      );
    default:
      // Unknown Prisma code — let the generic 500 path handle it (caller
      // can still `throw mapPrismaError(...)` safely; it returns the
      // original error unchanged so the outer catch sees the real cause).
      return err;
  }
}
