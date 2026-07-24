/**
 * Retry/backoff wrapper around `fetch` for GitHub API calls.
 *
 * GitHub returns transient failures under load — 429 (rate limit / secondary
 * limit), 502/503/504, and occasional network resets. Retrying these with
 * exponential backoff turns a flaky call into a reliable one; NOT retrying 4xx
 * (except 429) avoids hammering GitHub on a genuine client error.
 *
 * When GitHub tells us how long to wait (`Retry-After` seconds, or
 * `X-RateLimit-Reset` epoch on a 403/429 with remaining=0) we honour that
 * instead of blind backoff. The `sleep` fn is injectable so tests run instantly.
 *
 * Uses the global `fetch` — no new dependency.
 */

export interface RetryOptions {
  /** Max attempts total (including the first). Default 4. */
  maxAttempts?: number;
  /** Base backoff in ms; doubles each retry. Default 500. */
  baseDelayMs?: number;
  /** Ceiling on any single wait, ms. Default 20_000. */
  maxDelayMs?: number;
  /** Injectable delay (tests pass a no-op). Default real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retry on rate limits and server errors; never on other 4xx. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status <= 599);
}

/**
 * Parse an explicit wait hint from the response headers, in ms. Returns null
 * when GitHub gave no hint (caller falls back to exponential backoff).
 */
export function retryAfterMs(headers: Headers, nowMs: number): number | null {
  const ra = headers.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  }
  // Primary rate limit: reset is an epoch-seconds timestamp, valid only when
  // the remaining count has hit zero.
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");
  if (remaining === "0" && reset) {
    const resetMs = Number(reset) * 1000;
    if (Number.isFinite(resetMs)) return Math.max(0, resetMs - nowMs);
  }
  return null;
}

/**
 * `fetch` with bounded exponential-backoff retries on transient failures.
 * Non-retryable responses (2xx, or 4xx other than 429/408) return immediately.
 * A network error (fetch throws) is retried like a 5xx; the last error rethrows
 * once attempts are exhausted.
 */
export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 20_000;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(input, init);
    } catch (err) {
      // Network-level failure — treat like a transient server error.
      lastError = err;
    }

    if (res && !isRetryableStatus(res.status)) return res;
    if (attempt === maxAttempts) {
      if (res) return res; // return the final (retryable) response to the caller
      throw lastError instanceof Error
        ? lastError
        : new Error("GitHub request failed after retries");
    }

    // Prefer GitHub's explicit hint; else exponential backoff with a cap.
    const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
    const hinted = res ? retryAfterMs(res.headers, Date.now()) : null;
    const wait = hinted != null ? Math.min(hinted, maxDelayMs) : backoff;
    await sleep(wait);
  }
  // Unreachable (loop returns/throws), but satisfies the type checker.
  throw lastError instanceof Error ? lastError : new Error("GitHub request failed");
}
