import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getCorporateLearnersByCourse } from '@/lib/services/analytics-service';

// GET /api/analytics/corporate/learner-courses/:courseId — TENANT_ADMIN | SUB_ADMIN | ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'ADMIN']);
  return json(await getCorporateLearnersByCourse(actor.orgId ?? '', params!.courseId));
});
