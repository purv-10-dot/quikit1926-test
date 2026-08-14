import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getCourseAnalytics } from '@/lib/services/analytics-service';

// GET /api/analytics/corporate/course/:courseId — TENANT_ADMIN | SUB_ADMIN | ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'ADMIN']);
  return json(await getCourseAnalytics(actor.orgId ?? '', params!.courseId));
});
