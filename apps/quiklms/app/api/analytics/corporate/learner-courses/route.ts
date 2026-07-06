import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getCorporateLearnerCoursesOverview } from '@/lib/services/analytics-service';

// GET /api/analytics/corporate/learner-courses — TENANT_ADMIN | SUB_ADMIN | SUPER_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  return json(await getCorporateLearnerCoursesOverview(actor.tenantId ?? ''));
});
