import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTeacherConversionPerformance } from '@/lib/services/demo-analytics-service';

// GET /api/demo-analytics/teacher-performance — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json({ success: true, data: await getTeacherConversionPerformance(actor.tenantId!) });
});
