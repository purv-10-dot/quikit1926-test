/**
 * Shared fetch helper for provider REST calls with production hardening:
 *   - Timeout via AbortController (providers can hang).
 *   - Retry with exponential backoff on 429 + 5xx (honors Retry-After).
 *   - Structured ProviderHttpError carrying status + body for logging.
 *
 * Kept transport-only; provider-specific request shaping lives in gmail.ts /
 * microsoft.ts. No new dependency — native fetch + AbortController.
 */

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 30_000);
  }
  // 0.5s, 1s, 2s (+ small deterministic jitter by attempt — no Math.random).
  return Math.min(500 * 2 ** attempt + attempt * 100, 8_000);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Perform a fetch with timeout + retry. Returns the parsed JSON (or `undefined`
 * for empty bodies). Throws ProviderHttpError on a non-2xx that is exhausted or
 * non-retryable.
 */
export async function providerFetch<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...rest, signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      const body = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt, res.headers.get("retry-after")));
        continue;
      }
      throw new ProviderHttpError(
        `Provider request failed (${res.status}) for ${url}`,
        res.status,
        body.slice(0, 2000),
        retryable,
      );
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof ProviderHttpError) throw err;
      // Network/abort error — retry a few times, then surface.
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new ProviderHttpError(`Provider request errored for ${url}: ${msg}`, 0, "", true);
}
