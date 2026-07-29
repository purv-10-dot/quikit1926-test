import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getAllTeacherAvailability } from '@/lib/services/teacher-availability-service';

// GET /api/teacher-availability/all — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json({ success: true, data: await getAllTeacherAvailability(actor.orgId!) });
});
