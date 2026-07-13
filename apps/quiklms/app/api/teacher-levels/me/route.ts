import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { calculateTeacherLevel } from '@/lib/services/teacher-level-service';

// GET /api/teacher-levels/me — TEACHER (own level, recalculated)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER']);
  return json({ success: true, data: await calculateTeacherLevel(actor.orgId!, actor.id) });
});
