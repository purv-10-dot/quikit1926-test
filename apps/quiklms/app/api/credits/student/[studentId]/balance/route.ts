import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getStudentBalance } from '@/lib/services/credits-service';

// GET /api/credits/student/:studentId/balance — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await getStudentBalance(actor.tenantId!, params!.studentId));
});
