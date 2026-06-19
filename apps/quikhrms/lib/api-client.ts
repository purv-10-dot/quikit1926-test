/**
 * Centralized fetch client.
 *
 * Solves two server-load problems:
 *
 * 1. In-flight deduplication for GETs — if the same GET URL is requested while
 *    an identical request is already pending, the second caller receives the
 *    SAME promise instead of firing a new HTTP request. Eliminates duplicate
 *    requests from React StrictMode double-renders, parallel components asking
 *    for the same data, race conditions, etc.
 *
 * 2. Global concurrency limit — at most MAX_CONCURRENT outbound fetches at
 *    once. Extras queue. Prevents 20+ tabs/widgets hammering the server
 *    simultaneously on first paint.
 *
 * Mutations (POST/PUT/PATCH/DELETE) and uploads are NOT deduped (they have
 * side effects) but they DO obey the concurrency limit.
 */

// Concurrency cap on outbound fetches. In dev (HTTP/1.1) keep it at 5 so one of
// the browser's 6-per-origin connections stays free for the SSE EventSource and
// can't deadlock. In production (Vercel → HTTP/2, no 6-connection limit) allow
// more so a dashboard full of widgets doesn't serialize behind a few slow
// requests and feel frozen.
const MAX_CONCURRENT = process.env.NODE_ENV === "production" ? 12 : 5;
const DEDUP_TTL_MS = 5_000; // safety: drop dedupe slot after 5s even if request hangs

// Default per-request timeout. Without this, a hung server-side request would
// hold a concurrency slot forever and eventually freeze the whole app. Kept
// shorter so a stuck request frees its slot quickly instead of blocking the UI.
// Callers can override via `timeoutMs` (e.g. uploads pass 5min, long reports more).
const DEFAULT_TIMEOUT_MS = 20_000;

type Pending<T> = {
  promise: Promise<T>;
  controller: AbortController;
  expiresAt: number;
};

const inflight = new Map<string, Pending<unknown>>();

let active = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    queue.push(() => {
      active++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  active--;
  const next = queue.shift();
  if (next) next();
}

function dedupKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${url}`;
}

function isDedupableMethod(method: string): boolean {
  return method.toUpperCase() === "GET";
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | null;
  /** Skip the dedup cache even for GETs. Default: false. */
  noDedup?: boolean;
  /** Override the per-request timeout in ms. 0 disables timeout entirely. */
  timeoutMs?: number;
}

export class RequestTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "RequestTimeoutError";
  }
}

/**
 * Single entry point. Handles dedup, concurrency, abort propagation.
 */
export async function managedFetch<T>(
  url: string,
  options: RequestOptions = {},
  parseJson: (res: Response) => Promise<T>,
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const canDedup = isDedupableMethod(method) && !options.noDedup;

  if (canDedup) {
    const key = dedupKey(method, url);
    const cached = inflight.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.promise as Promise<T>;
    }
    if (cached) inflight.delete(key);

    const controller = new AbortController();
    const promise = runWithSlot(url, options, controller, parseJson);

    inflight.set(key, {
      promise: promise as Promise<unknown>,
      controller,
      expiresAt: Date.now() + DEDUP_TTL_MS,
    });
    // Cleanup runs on settle. `.finally()` forks a NEW promise chain; if the
    // request rejects (e.g. "Failed to fetch" during an HMR recompile) and this
    // fork has no catch, it surfaces as an UNHANDLED rejection / dev error
    // overlay. The real error is still delivered to the caller via `promise`,
    // so we swallow it here only.
    promise
      .finally(() => {
        const slot = inflight.get(key);
        if (slot && slot.promise === (promise as Promise<unknown>)) inflight.delete(key);
      })
      .catch(() => { /* handled by caller via the returned promise */ });
    return promise;
  }

  const controller = new AbortController();
  return runWithSlot(url, options, controller, parseJson);
}

async function runWithSlot<T>(
  url: string,
  options: RequestOptions,
  controller: AbortController,
  parseJson: (res: Response) => Promise<T>,
): Promise<T> {
  await acquireSlot();

  // Default timeout. 0 disables. Caller's external signal still takes precedence.
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      try { controller.abort(); } catch { /* noop */ }
    }, timeoutMs);
  }

  try {
    const merged: RequestInit = {
      ...options,
      signal: options.signal ?? controller.signal,
    };
    const res = await fetch(url, merged);
    return await parseJson(res);
  } catch (err) {
    if (timedOut) throw new RequestTimeoutError(timeoutMs);
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    releaseSlot();
  }
}

/** Cancel every in-flight GET — call on hard route changes / logout. */
export function abortAllInflight(): void {
  for (const [, slot] of inflight) {
    try { slot.controller.abort(); } catch { /* noop */ }
  }
  inflight.clear();
}

/** For tests / debugging. */
export function inflightStats() {
  return { activeRequests: active, queued: queue.length, dedupCacheSize: inflight.size };
}
