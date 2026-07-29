import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { removeStudent } from '@/lib/services/batches-service';

// DELETE /api/batches/:id/students/:studentId — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  return json(await removeStudent(actor.orgId!, params!.id, params!.studentId));
});
