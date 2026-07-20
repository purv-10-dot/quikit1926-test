import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getAttendanceTrend } from '@/lib/services/analytics-service';

// GET /api/analytics/attendance-trend?days= — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  // Clamped. The service groups in JS over an unbounded findMany, so an
  // uncapped caller-controlled window (`?days=100000`) pulled the whole
  // analytics_events table into the request heap — a one-parameter OOM that
  // took unrelated concurrent requests down with it.
  const rawDays = url.searchParams.get('days') ? parseInt(url.searchParams.get('days')!, 10) : 14;
  const days = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, rawDays)) : 14;
  return json(await getAttendanceTrend(actor.orgId ?? '', days));
});
