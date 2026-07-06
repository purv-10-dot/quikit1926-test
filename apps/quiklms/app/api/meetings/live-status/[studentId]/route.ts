import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getLiveClassStatus } from '@/lib/services/meetings-service';

// GET /api/meetings/live-status/:studentId — PARENT | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['PARENT', 'TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await getLiveClassStatus(actor.tenantId!, params!.studentId));
});
