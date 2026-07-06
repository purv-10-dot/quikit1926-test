import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getActivityLogs } from '@/lib/services/audit-service';

// GET /api/audit/activity-logs?limit=&skip=&tenantId= — SUPER_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 50;
    const skip = url.searchParams.get('skip') ? parseInt(url.searchParams.get('skip')!, 10) : 0;
    const tenantId = url.searchParams.get('tenantId') || undefined;
    return json({ success: true, data: await getActivityLogs(limit, skip, tenantId) });
  } catch (e) {
    throw BadRequest(e instanceof Error ? e.message : 'Failed to fetch activity logs');
  }
});
