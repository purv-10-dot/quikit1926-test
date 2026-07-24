/**
 * SERVER-ONLY — REST → Socket.IO bridge.
 *
 * The Socket.IO server does NOT live in this Next app; it runs in the separate
 * `apps/quiklms/worker` process (`worker/src/sockets/messages.ts`, namespace
 * `/messages`, rooms `conv:<conversationId>`). The chat UI performs its
 * mutations over REST (`/api/messages/...`), so the route handler is the only
 * place that knows a message was sent/edited/deleted/reacted to — and it has no
 * in-process `io` to broadcast with. That is the exact bridge the legacy Nest
 * app got for free by calling `messagesGateway.emitToConversation(...)` from
 * `MessagesController` (both lived in one process).
 *
 * This module restores it by POSTing to the worker's internal emit endpoint:
 *
 *   POST {WORKER_URL}/internal/emit
 *   x-internal-secret: ${INTERNAL_SECRET}
 *   { namespace, room, event, data }  →  200 {"ok":true} | 401
 *
 * ── Non-negotiable property: this must never break or slow down chat. ────────
 * Persisting the message is the contract of the REST route; broadcasting is a
 * best-effort nicety. If the worker is down, undeployed, unreachable, slow, or
 * the env vars are unset, the mutation must still return its normal response at
 * its normal latency. Therefore every call here is fire-and-forget: the fetch
 * promise is never awaited, never returned, always `.catch()`-ed, and bounded
 * by a short AbortSignal timeout. The exported function returns `void` and is
 * wrapped end-to-end in try/catch so it cannot throw synchronously either
 * (e.g. on a non-serialisable payload).
 *
 * NEVER import this from a client component — it reads INTERNAL_SECRET.
 */

const NAMESPACE = '/messages';
const EMIT_TIMEOUT_MS = 2000;

/** Warn once per process per reason — route handlers are hot paths. */
const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(`[worker-emit] ${message}`);
}

/**
 * WORKER_URL is the server-side (possibly internal) address; the
 * NEXT_PUBLIC_ variant is what the browser socket already uses and is the
 * sensible fallback when only the public one is configured.
 */
function resolveBaseUrl(): string | null {
  const raw = process.env.WORKER_URL ?? process.env.NEXT_PUBLIC_WORKER_URL ?? '';
  const base = raw.trim().replace(/\/+$/, '');
  return base || null;
}

function timeoutSignal(): AbortSignal | undefined {
  try {
    // Node >= 18.17 (Next 14's floor) has it; guarded anyway.
    return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(EMIT_TIMEOUT_MS)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * On Vercel the function can be frozen the instant the response is returned,
 * which would cancel an un-awaited fetch. If a request context exposing
 * `waitUntil` is present, hand the promise to it so the platform keeps the
 * invocation alive until the emit settles — WITHOUT the response waiting on it.
 * Entirely optional: absent (e.g. `next dev`, a long-lived Node server), the
 * promise simply runs to completion on its own.
 */
function keepAlive(promise: Promise<unknown>): void {
  try {
    const ctx = (
      globalThis as unknown as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } }>
    )[Symbol.for('@vercel/request-context')]?.get?.();
    ctx?.waitUntil?.(promise);
  } catch {
    /* no request context — fire-and-forget is fine */
  }
}

/**
 * Broadcast `event` with `data` to every socket in `conv:<conversationId>` on
 * the `/messages` namespace. Returns immediately; failures are swallowed.
 *
 * Call it AFTER the service call succeeds and (ideally) after `json(payload)`,
 * because `json()` recursively aliases `id` → `_id` in place — emitting the
 * same object afterwards guarantees the socket payload is identical to the
 * REST response the sender received.
 */
export function emitToConversation(conversationId: string, event: string, data: unknown): void {
  try {
    // Defensive: this module must never execute in a browser bundle.
    if (typeof window !== 'undefined') return;
    if (!conversationId || !event) return;

    const base = resolveBaseUrl();
    const secret = process.env.INTERNAL_SECRET;

    if (!base) {
      warnOnce('no-url', 'WORKER_URL / NEXT_PUBLIC_WORKER_URL unset — realtime broadcast disabled.');
      return;
    }
    if (!secret) {
      warnOnce('no-secret', 'INTERNAL_SECRET unset — realtime broadcast disabled.');
      return;
    }

    // Serialise up-front so a bad payload throws HERE, inside the try/catch,
    // rather than inside fetch on the microtask queue.
    const body = JSON.stringify({
      namespace: NAMESPACE,
      room: `conv:${conversationId}`,
      event,
      data,
    });

    const promise = fetch(`${base}/internal/emit`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': secret,
      },
      body,
      cache: 'no-store',
      signal: timeoutSignal(),
    })
      .then((res) => {
        // Drain the body so the underlying socket is released promptly.
        void res.text().catch(() => {});
        if (!res.ok) {
          warnOnce(`status-${res.status}`, `worker /internal/emit responded ${res.status} (event=${event}).`);
        }
      })
      .catch(() => {
        warnOnce('unreachable', 'worker /internal/emit unreachable — chat still persists over REST.');
      });

    keepAlive(promise);
  } catch {
    /* never let a broadcast failure surface to the caller */
  }
}

export default emitToConversation;
