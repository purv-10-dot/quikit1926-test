/**
 * Classifies connector failures into "not usable yet" vs "actually broken".
 *
 * WHY THIS EXISTS. Every platform route hand-rolled the same check:
 *
 *   if (message.includes("not connected") || message.includes("not configured"))
 *     return NextResponse.json({ connected: false });
 *   return NextResponse.json({ error: message }, { status: 500 });
 *
 * That list missed the "… not set" family thrown by six connectors
 * (`Search Console site not set`, `GA4 property not set`, `GBP location not
 * set`, `LinkedIn organization not set`, `Dynamics org URL not set`), so a
 * workspace that had authorised a platform but not yet picked which
 * site/property/location to read produced a hard 500. That is a configuration
 * state, not a server fault: the page should show its connect/configure prompt,
 * and the sample-data fallback in lib/api/sample.ts keys on `connected` to do
 * exactly that.
 *
 * Matching on message text is inherently fragile — the durable fix is typed
 * connector errors — but centralising it means there is one list to extend
 * instead of nine, and adding a connector can no longer silently produce a 500.
 */

/** Substrings that mean "the user still has setup to do", not "we broke". */
const UNCONFIGURED_PATTERNS = [
  "not connected",
  "not configured",
  "not set",
  "no accessible customers",
  "no ad account",
  "no google",
  "no youtube channel",
  "no facebook page selected",
  "no instagram business account",
];

export function isUnconfiguredError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return UNCONFIGURED_PATTERNS.some((p) => message.includes(p));
}

/**
 * Thrown by a connector when there is no PlatformConnection row at all for
 * this platform/workspace — the user has never been through OAuth for it.
 * Distinct from every other "unconfigured" state (row exists but inactive,
 * or connected with no page/property picked yet), which are real signals
 * that a connection was attempted and needs attention rather than a first-
 * time empty state. See withSample() in lib/api/sample.ts for why the
 * distinction matters: sample data must only stand in for "never connected".
 */
export class NoConnectionError extends Error {
  constructor(message = "No connection exists for this platform") {
    super(message);
    this.name = "NoConnectionError";
  }
}

export function isNoConnectionError(err: unknown): boolean {
  return err instanceof NoConnectionError;
}

/**
 * Best available description of a failure.
 *
 * Google's client throws Errors whose `.message` is often just
 * "Request failed with status code 403" — the useful part ("User does not have
 * sufficient permission for site …", "Request had insufficient authentication
 * scopes") lives in `response.data.error.message`. Meta and HubSpot nest theirs
 * similarly. Without this, the surfaced message says what happened but never why.
 */
export function errorMessage(err: unknown, fallback = "Failed"): string {
  const detail = providerDetail(err);
  if (detail) return detail;
  return err instanceof Error ? err.message : fallback;
}

function providerDetail(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as {
    message?: string;
    response?: { status?: number; data?: { error?: unknown; error_description?: string } };
  };
  const data = e.response?.data;
  if (!data) return null;

  const status = e.response?.status;
  const prefix = status ? `${status}: ` : "";

  // Google / most REST APIs: { error: { message } }.  Meta: { error: { message } }.
  const inner = data.error;
  if (inner && typeof inner === "object" && typeof (inner as { message?: string }).message === "string") {
    return `${prefix}${(inner as { message: string }).message}`;
  }
  // OAuth token endpoints: { error: "invalid_grant", error_description: "…" }.
  if (typeof inner === "string") {
    return `${prefix}${inner}${data.error_description ? ` — ${data.error_description}` : ""}`;
  }
  return null;
}

/**
 * Standard catch handler for a platform route.
 *
 * No connection row at all → `{ connected: false, neverConnected: true }` —
 * the only case sample data (withSample() in lib/api/sample.ts) should stand
 * in for. Every other "unconfigured"/expired-auth state still reports
 * `connected: false` so the page shows its setup/reconnect prompt, but WITHOUT
 * `neverConnected`, so the client shows real zeros + a fix-it prompt instead
 * of fabricated sample figures — a connection that was attempted and is now
 * broken or incomplete must never be papered over with invented numbers.
 * Anything else → 500, AND logged with the platform name. Previously these
 * failures were returned to the browser and never written anywhere, so a real
 * outage showed up as a bare `500` in the dev console with no way to tell what
 * had actually gone wrong.
 */
export function connectorErrorResponse(platform: string, err: unknown) {
  if (isNoConnectionError(err)) {
    return { body: { connected: false, neverConnected: true }, status: 200 as const };
  }

  if (isUnconfiguredError(err)) {
    return { body: { connected: false }, status: 200 as const };
  }

  // A dead OAuth grant is an auth state, not a server fault: the only fix is for
  // the user to reconnect. Report it as not-connected so the page shows its
  // connect prompt instead of a hard 500 on every load.
  if (isAuthExpiredError(err)) {
    console.warn(`[api/${platform}] OAuth grant is no longer valid — reconnect required`);
    return { body: { connected: false, needsReauth: true }, status: 200 as const };
  }

  console.error(`[api/${platform}] fetch failed:`, safeErrorLog(err));
  return { body: { error: errorMessage(err) }, status: 500 as const };
}

/**
 * The refresh token is dead — revoked, expired, or the grant was withdrawn.
 *
 * Google returns `invalid_grant` for all of these. Retrying can never succeed;
 * the platform must be reconnected.
 */
export function isAuthExpiredError(err: unknown): boolean {
  const detail = `${providerDetail(err) ?? ""} ${errorMessage(err, "")}`.toLowerCase();
  return (
    detail.includes("invalid_grant") ||
    detail.includes("token has been expired or revoked") ||
    detail.includes("invalid_token") ||
    detail.includes("refresh token")
  );
}

/**
 * A log-safe view of a provider error.
 *
 * NEVER log the raw error object. Gaxios attaches the outbound request to
 * `config.data` / `config.body`, and for a token refresh that request contains
 * the REFRESH TOKEN in plaintext. Gaxios redacts `client_secret` but not the
 * refresh token, so `console.error(err)` writes a live credential into the
 * terminal and into whatever aggregates logs in production.
 */
export function safeErrorLog(err: unknown): Record<string, unknown> {
  const e = err as {
    name?: string;
    message?: string;
    code?: string | number;
    status?: number;
    stack?: string;
    response?: { status?: number };
  };
  return {
    name: e?.name ?? "Error",
    message: errorMessage(err),
    status: e?.response?.status ?? e?.status ?? e?.code,
    // First few frames are enough to locate the call site; the rest is noise.
    stack: typeof e?.stack === "string" ? e.stack.split("\n").slice(0, 4).join("\n") : undefined,
  };
}
