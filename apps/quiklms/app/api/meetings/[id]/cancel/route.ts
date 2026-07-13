import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { cancelMeeting } from '@/lib/services/meetings-service';

// POST /api/meetings/:id/cancel — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await cancelMeeting(actor.orgId!, params!.id));
});
