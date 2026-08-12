import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toErrorMessage } from "@/lib/api/errors";
import { hashPatToken, isPatValid } from "@/lib/api/patToken";
import { loadProjectAccess } from "@/lib/api/withProjectAccess";
import { rateLimitAsync } from "@quikit/shared/rateLimit";

export interface PatAuthContext {
  userId: string;
  orgId: string;
  projectId: string;
  /** Every PAT-authenticated caller is an automated tool, never a human at a keyboard. */
  actorType: "agent";
}

export type PatAuthResult =
  | { ok: true; context: PatAuthContext }
  | { ok: false; status: 401 }
  | { ok: false; status: 429; retryAfterSeconds: number };

export interface WithPatAuthOptions {
  fallbackErrorMessage?: string;
}

function unauthorized(): NextResponse {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

function rateLimited(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { success: false, error: "Too many requests" },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } },
  );
}

const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;
/** Bounds how hard a single PAT (leaked or misbehaving) can hammer the API. */
const PAT_RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

function touchLastUsedAt(id: string, lastUsedAt: Date | null, now: Date): void {
  const isStale = !lastUsedAt || now.getTime() - lastUsedAt.getTime() > LAST_USED_THROTTLE_MS;
  if (!isStale) return;
  // A bare `void`-ed promise with no attached continuation can be torn down
  // before it completes once the enclosing request finishes — attach a
  // no-op `.catch()` so the update actually runs to completion and a
  // rejection doesn't surface as an unhandled promise rejection.
  db.qtPersonalAccessToken
    .update({ where: { id }, data: { lastUsedAt: now } })
    .catch(() => undefined);
}

/**
 * Resolves a PAT from a request's Authorization header to {userId, orgId,
 * projectId}, or a 401/429 outcome if missing/malformed/not-found/expired/
 * revoked/rate-limited. Plain function (no NextResponse coupling) so both
 * withPatAuth and the raw MCP transport route (which returns a standard
 * Response, not NextResponse) can share the same resolution logic.
 */
export async function resolvePatAuth(req: Request): Promise<PatAuthResult> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { ok: false, status: 401 };

  const tokenHash = hashPatToken(token);

  // Keyed by the token's own hash — bounds a single leaked/misbehaving PAT
  // regardless of which IP(s) it's called from.
  const rl = await rateLimitAsync({
    routeKey: "quiktrack:pat",
    clientKey: tokenHash,
    ...PAT_RATE_LIMIT,
    failClosed: process.env.NODE_ENV === "production",
  });
  if (!rl.ok) {
    return { ok: false, status: 429, retryAfterSeconds: rl.retryAfterSeconds };
  }

  const pat = await db.qtPersonalAccessToken.findFirst({
    where: { tokenHash },
    select: {
      id: true,
      orgId: true,
      projectId: true,
      createdById: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
    },
  });
  const now = new Date();
  if (!pat || !isPatValid(pat, now)) return { ok: false, status: 401 };

  // The token's own expiry/revocation is fine, but its creator may have since
  // lost access (removed from the org or the project) — recheck live access
  // on every call, mirroring withOrgAuth's Bearer-token recheck. A token
  // whose creator no longer qualifies is auto-revoked so it also stops
  // appearing as active in the PAT settings UI, not just at the API layer.
  const access = await loadProjectAccess(pat.orgId, pat.createdById, pat.projectId);
  if (!access) {
    await db.qtPersonalAccessToken
      .update({ where: { id: pat.id }, data: { revokedAt: now } })
      .catch(() => undefined);
    return { ok: false, status: 401 };
  }

  touchLastUsedAt(pat.id, pat.lastUsedAt, now);

  return {
    ok: true,
    context: {
      userId: pat.createdById,
      orgId: pat.orgId,
      projectId: pat.projectId,
      actorType: "agent",
    },
  };
}

export function withPatAuth<Params = Record<string, never>>(
  handler: (
    ctx: PatAuthContext,
    req: NextRequest,
    routeCtx: { params: Params },
  ) => Promise<NextResponse> | NextResponse,
  options: WithPatAuthOptions = {},
) {
  return async (req: NextRequest, routeCtx: { params: Params }): Promise<NextResponse> => {
    try {
      const result = await resolvePatAuth(req);
      if (!result.ok) {
        return result.status === 429 ? rateLimited(result.retryAfterSeconds) : unauthorized();
      }
      return await handler(result.context, req, routeCtx ?? ({ params: {} as Params }));
    } catch (error: unknown) {
      return NextResponse.json(
        { success: false, error: toErrorMessage(error, options.fallbackErrorMessage ?? "Operation failed") },
        { status: 500 },
      );
    }
  };
}
