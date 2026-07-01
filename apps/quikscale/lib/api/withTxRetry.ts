import { Prisma } from "@quikit/database";

/**
 * Postgres SQLSTATE codes that mean "this transaction lost a concurrency race
 * and should simply be retried":
 *   40001 → serialization_failure
 *   40P01 → deadlock_detected
 */
const RETRYABLE_PG_CODES = new Set(["40001", "40P01"]);

/**
 * Decide whether an error is a transient deadlock / serialization failure that
 * is safe to retry. Anything else (validation, not-found, unique-constraint,
 * auth, etc.) returns false so it propagates immediately and the route's normal
 * error handling is unchanged.
 */
export function isRetryableTxError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    // Prisma normalizes write conflicts / deadlocks to P2034.
    if (e.code === "P2034") return true;
    // Some drivers surface the raw Postgres code under meta.code.
    const pg = (e.meta as { code?: string } | undefined)?.code;
    if (pg && RETRYABLE_PG_CODES.has(pg)) return true;
  }
  const code = (e as { code?: string } | null | undefined)?.code;
  return !!code && RETRYABLE_PG_CODES.has(code);
}

export interface WithTxRetryOptions {
  /** Max number of RETRIES after the first attempt (default 3 → up to 4 tries). */
  retries?: number;
  /** Base backoff in ms; actual delay is full-jitter exponential (default 25). */
  baseDelayMs?: number;
}

/**
 * Run a database operation, retrying ONLY on Postgres deadlock /
 * serialization failures with full-jitter exponential backoff.
 *
 * Behavior-preserving by design: a successful operation returns its result
 * unchanged, and any non-retryable error is re-thrown on the first attempt.
 * The wrapped `fn` must be idempotent (e.g. an upsert, a recompute-from-scratch,
 * or a deleteMany+createMany replace) so a retry produces the same final state.
 *
 *   await withTxRetry(() => db.$transaction([...]));
 */
export async function withTxRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 25 }: WithTxRetryOptions = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRetryableTxError(e) || attempt === retries) throw e;
      // Full-jitter exponential backoff: random in [0, baseDelayMs * 2^attempt).
      const delay = Math.random() * baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // Unreachable: the loop either returns or throws. Satisfies the type checker.
  throw lastErr;
}
