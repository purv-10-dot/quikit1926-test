import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { calculateTeacherLevel } from '@/lib/services/teacher-level-service';

// POST /api/teacher-levels/recalculate/:teacherId — TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const level = await calculateTeacherLevel(actor.tenantId!, params!.teacherId);
  return json({ success: true, data: level });
});
