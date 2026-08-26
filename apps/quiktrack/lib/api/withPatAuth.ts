import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toErrorMessage } from "@/lib/api/errors";
import { hashPatToken, isPatValid } from "@/lib/api/patToken";
import { isActiveOrgMember, loadProjectAccess } from "@/lib/api/withProjectAccess";
import { rateLimitAsync } from "@quikit/shared/rateLimit";

export interface PatAuthContext {
  userId: string;
  orgId: string;
  /** Null for a user-scoped token (resolves to {userId, orgId} only). Non-null
   * only for a legacy project-scoped token issued before user-scoped tokens
   * existed. */
  projectId: string | null;
  /** Every PAT-authenticated caller is an automated tool, never a human at a keyboard. */
  actorType: "agent";
  /** The PAT's own user-supplied name (e.g. "Claude Code — laptop") — identifies which tool/token acted, for the same rows that carry actorType. */
  actingAgentId: string;
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
/** Consecutive failed live access-rechecks required before auto-revoking a PAT. */
const REVOKE_AFTER_CONSECUTIVE_FAILURES = 3;

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

const ACCESS_RECHECK_ATTEMPTS = 2;
const ACCESS_RECHECK_BACKOFF_MS = 100;

/**
 * A distinct outcome from the negative case (`ok: true, hasAccess: false`) —
 * every attempt at the live-access recheck THREW (DB timeout, connection
 * blip, transient upstream error) rather than returning an answer. Callers
 * must not treat this as "no access": a wrongly-revoked PAT is a developer
 * silently losing automation with no obvious cause and no way to undo it,
 * while honouring a PAT through a brief DB blip costs almost nothing — every
 * request still re-checks access on its own. Same reasoning as the runtime's
 * kill-switch lookup: a lookup error there fails OPEN, because turning a
 * database blip into an outage is worse than the thing the check guards
 * against.
 */
type AccessRecheckResult =
  | { ok: true; hasAccess: true }
  | { ok: true; hasAccess: false }
  | { ok: false };

/**
 * Retries `check` up to `ACCESS_RECHECK_ATTEMPTS` times with a short backoff.
 * Only a call that actually RETURNS (true or false) counts as an answer — a
 * thrown error is a failed check, not a negative one, and is retried. If every
 * attempt throws, the caller gets `{ ok: false }` and must NOT revoke on it.
 *
 * Takes a thunk rather than fixed ids so one retry covers BOTH access branches:
 * `loadProjectAccess` for a legacy project-scoped PAT — which is four
 * sequential queries (project lookup, two admin checks, membership), any of
 * which can throw, so the retry must wrap the whole call and not just the
 * first query — and `isActiveOrgMember` for a user-scoped one. The user-scoped
 * branch is the common case today and has exactly the same exposure.
 */
async function recheckAccess(check: () => Promise<boolean>): Promise<AccessRecheckResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ACCESS_RECHECK_ATTEMPTS; attempt++) {
    try {
      return (await check()) ? { ok: true, hasAccess: true } : { ok: true, hasAccess: false };
    } catch (error: unknown) {
      lastError = error;
      if (attempt < ACCESS_RECHECK_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, ACCESS_RECHECK_BACKOFF_MS));
      }
    }
  }
  console.warn(
    "[withPatAuth] live-access recheck failed after retries — leaving the PAT untouched, not revoking",
    lastError,
  );
  return { ok: false };
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
      name: true,
      failedAccessChecks: true,
    },
  });
  const now = new Date();
  if (!pat || !isPatValid(pat, now)) return { ok: false, status: 401 };

  // The token's own expiry/revocation is fine, but its creator may have since
  // lost access (removed from the org, or — for a legacy project-scoped
  // token — from that specific project) — recheck live access on every call,
  // mirroring withOrgAuth's Bearer-token recheck. A single failed recheck can
  // be a transient read rather than genuine lost access, so we only
  // auto-revoke after several consecutive failures — that still gets a token
  // whose creator truly lost access flagged revoked in the PAT settings UI,
  // without one flaky read permanently killing a live token.
  //
  // Retried, and a failed check is NOT the same thing as a genuine "no access"
  // answer — see recheckAccess's doc comment. Only `hasAccess: false` (the
  // check actually ran and came back negative) touches the counter. A recheck
  // that errors on every attempt (`ok: false`) fails this one request and
  // writes NOTHING: no revokedAt, no increment, and no reset either — a
  // transient error is not evidence of success any more than it is of
  // failure. Otherwise three DB blips in a row would revoke a live token.
  //
  // `projectId` is read into a local so the ternary narrows it for the closure
  // (a non-null assertion would be the alternative, and this app forbids that
  // class of escape hatch).
  const projectId = pat.projectId;
  const recheck = await recheckAccess(
    projectId
      ? async () => Boolean(await loadProjectAccess(pat.orgId, pat.createdById, projectId))
      : () => isActiveOrgMember(pat.orgId, pat.createdById),
  );
  if (!recheck.ok) return { ok: false, status: 401 };
  if (!recheck.hasAccess) {
    const failedAccessChecks = pat.failedAccessChecks + 1;
    await db.qtPersonalAccessToken
      .update({
        where: { id: pat.id },
        data:
          failedAccessChecks >= REVOKE_AFTER_CONSECUTIVE_FAILURES
            ? { revokedAt: now, failedAccessChecks }
            : { failedAccessChecks },
      })
      .catch(() => undefined);
    return { ok: false, status: 401 };
  }
  if (pat.failedAccessChecks > 0) {
    await db.qtPersonalAccessToken
      .update({ where: { id: pat.id }, data: { failedAccessChecks: 0 } })
      .catch(() => undefined);
  }

  touchLastUsedAt(pat.id, pat.lastUsedAt, now);

  return {
    ok: true,
    context: {
      userId: pat.createdById,
      orgId: pat.orgId,
      projectId: pat.projectId,
      actorType: "agent",
      actingAgentId: pat.name,
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
