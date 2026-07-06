import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getStudentJourney } from '@/lib/services/demo-analytics-service';

// GET /api/demo-analytics/student-journey/:studentId — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json({ success: true, data: await getStudentJourney(actor.tenantId!, params!.studentId) });
});
