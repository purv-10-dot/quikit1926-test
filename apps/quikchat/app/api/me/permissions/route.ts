import { withOrgAuth } from "@/lib/auth-shims";
import { loadMyPermissions } from "@/lib/authz/permissions";
import { collapseToLatestRole } from "@/lib/authz/seed";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/permissions — the current user's effective QuikChat permission
 * set (UNION of role grants + user extras) for the active org. Powers the
 * client-side gate (`useMyPermissions`). Returns the bare `MyPermissions`
 * object (QuikChat's convention — no `{ success, data }` envelope).
 *
 * Seed-before-check: `withOrgAuth` already ran `ensureUserRole`, so by here the
 * caller holds ≥Member. We additionally run `collapseToLatestRole` here (as
 * QuikScale does) so a stale double-assignment self-heals on app mount.
 * Server gates are authoritative; this endpoint only informs UI hiding.
 */
export const GET = withOrgAuth(async (_req, ctx) => {
  await collapseToLatestRole(ctx.userId, ctx.orgId);
  return Response.json(await loadMyPermissions(ctx.userId, ctx.orgId));
});
