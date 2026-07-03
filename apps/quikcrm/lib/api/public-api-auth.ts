/**
 * API-Key authentication for the public API layer (`/api/public/*`).
 *
 * These endpoints are consumed by third-party dashboards, NOT by browser
 * sessions — so they authenticate with a long-lived API Secret Key instead of
 * the NextAuth/OAuth session used everywhere else in the app. This is the one
 * sanctioned exception to the `withTenantAuth` rule (see apps/quikcrm/CLAUDE.md
 * §"Hard do-not" #4): a parallel, equally strict tenant-resolution guard that
 * every public endpoint MUST route through so the validation logic lives in
 * exactly one place.
 *
 * Wire format (either header is accepted, `Authorization` wins if both sent):
 *   Authorization: Bearer <api_key>
 *   X-Api-Key: <api_key>
 *
 * Validation outcomes:
 *   - missing / malformed / unknown key  → 401 Unauthorized
 *   - known key but inactive or revoked   → 403 Forbidden
 *   - valid & active                      → resolves { orgId, apiKeyId }
 *
 * We never store or compare the raw secret: the DB holds a SHA-256 hash
 * (`CrmApiKey.keyHash`, unique) and we hash the incoming key the same way.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

/** Human-readable prefix stamped on every issued key (helps ops spot leaks). */
export const API_KEY_PREFIX = "qcrm_";

/** Context handed to a public endpoint once the API key checks out. */
export interface PublicApiContext {
  orgId: string;
  apiKeyId: string;
}

/** Discriminated result so callers can branch without try/catch. */
export type PublicApiAuthResult =
  | { ok: true; ctx: PublicApiContext }
  | { ok: false; response: NextResponse };

/** SHA-256 hex digest — the only representation of a secret we persist/compare. */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Mint a fresh raw API key plus the derived columns for `CrmApiKey`.
 * The raw value is returned ONCE (show it to the user, never store it).
 */
export function generateApiKey(): {
  rawKey: string;
  keyHash: string;
  prefix: string;
  lastFour: string;
} {
  const secret = randomBytes(24).toString("hex"); // 48 hex chars of entropy
  const rawKey = `${API_KEY_PREFIX}${secret}`;
  return {
    rawKey,
    keyHash: hashApiKey(rawKey),
    prefix: API_KEY_PREFIX,
    lastFour: rawKey.slice(-4),
  };
}

function unauthorized(message = "Invalid API key"): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

function forbidden(message = "API key is inactive"): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

/**
 * Pull the raw API key out of the request headers.
 * Prefers `Authorization: Bearer <key>`, falls back to `X-Api-Key`.
 * Returns null when neither header carries a usable value.
 */
export function extractApiKey(req: NextRequest): string | null {
  const authz = req.headers.get("authorization");
  if (authz) {
    const match = /^Bearer\s+(.+)$/i.exec(authz.trim());
    if (match?.[1]) return match[1].trim();
  }
  const headerKey = req.headers.get("x-api-key");
  if (headerKey && headerKey.trim().length > 0) return headerKey.trim();
  return null;
}

/**
 * Constant-time comparison of two hex digests. `timingSafeEqual` throws on
 * length mismatch, so guard first. Both inputs here are fixed-length SHA-256
 * hex strings, but we stay defensive.
 */
function safeHashEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * The single validation entry point every public endpoint uses.
 *
 * Resolves the tenant (`orgId`) from the API key and returns a discriminated
 * result: on failure it carries the exact NextResponse (401/403) to return; on
 * success it carries `{ orgId, apiKeyId }`.
 *
 * Side effect: bumps `lastUsedAt` for a valid key (best-effort, never blocks
 * or fails the request).
 */
export async function authenticatePublicApi(
  req: NextRequest,
): Promise<PublicApiAuthResult> {
  const rawKey = extractApiKey(req);
  if (!rawKey) {
    return { ok: false, response: unauthorized("Missing API key") };
  }

  const keyHash = hashApiKey(rawKey);

  // Look the key up by its (indexed, unique) hash. We select the stored hash
  // too so the final match is a constant-time comparison rather than relying
  // solely on the DB equality.
  const record = await db.crmApiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      orgId: true,
      keyHash: true,
      isActive: true,
      revokedAt: true,
    },
  });

  if (!record || !safeHashEqual(record.keyHash, keyHash)) {
    return { ok: false, response: unauthorized() };
  }

  // Known key, but disabled → 403 (distinct from an unknown key's 401).
  if (!record.isActive || record.revokedAt) {
    return { ok: false, response: forbidden() };
  }

  // Best-effort usage timestamp; failures here must not fail the request.
  void db.crmApiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return { ok: true, ctx: { orgId: record.orgId, apiKeyId: record.id } };
}

/**
 * Higher-order wrapper mirroring `withTenantAuth`, but for the public API.
 * Runs the API-key guard + a uniform try/catch around a handler that receives
 * the resolved `{ orgId, apiKeyId }` context.
 *
 * Usage:
 *   export const GET = withPublicApiAuth(async ({ orgId }, req) => {
 *     const total = await db.crmContact.count({ where: { orgId } });
 *     return NextResponse.json({ total });
 *   });
 */
export function withPublicApiAuth(
  handler: (
    ctx: PublicApiContext,
    req: NextRequest,
  ) => Promise<NextResponse> | NextResponse,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const auth = await authenticatePublicApi(req);
      if (!auth.ok) return auth.response;
      return await handler(auth.ctx, req);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Operation failed";
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  };
}
