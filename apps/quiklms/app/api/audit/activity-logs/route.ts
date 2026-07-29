import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles, visibleOrgIds, assertOrgAccess } from '@/lib/auth/context';
import { getActivityLogs } from '@/lib/services/audit-service';

// GET /api/audit/activity-logs?limit=&skip=&orgId= — SUPER_ADMIN
//
// `orgId` is a CLIENT-SUPPLIED query param and the role check was the only gate, so
// any holder of the SUPER_ADMIN role could read another org's activity log by naming
// it in the URL — and omitting it returned every org's log. Now: the operator may
// still target any org (or all), and everyone else is pinned to their own.
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 50;
    const skip = url.searchParams.get('skip') ? parseInt(url.searchParams.get('skip')!, 10) : 0;
    const requested = url.searchParams.get('orgId') || undefined;
    await assertOrgAccess(actor, requested);
    // An explicit (authorised) orgId targets that one org; otherwise the caller's whole
    // visible set — their own org plus the ones they onboarded.
    const orgIds = requested ? [requested] : await visibleOrgIds(actor);
    return json({ success: true, data: await getActivityLogs(limit, skip, orgIds) });
  } catch (e) {
    throw BadRequest(e instanceof Error ? e.message : 'Failed to fetch activity logs');
  }
});
