import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getAvailableTeachers } from '@/lib/services/tutoring-requests-service';

// GET /api/tutoring-requests/available-teachers — LEARNER | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['LEARNER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await getAvailableTeachers(actor.tenantId!));
});
