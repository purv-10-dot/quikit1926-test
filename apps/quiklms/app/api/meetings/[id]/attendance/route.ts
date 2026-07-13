import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getMeetingAttendance } from '@/lib/services/meetings-service';

// GET /api/meetings/:id/attendance — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  return json(await getMeetingAttendance(actor.orgId!, params!.id));
});
