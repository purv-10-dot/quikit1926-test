import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getAdminTasks } from '@/lib/services/non-teaching-work-service';

// GET /api/non-teaching-work/admin?teacherId=&status= — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const teacherId = url.searchParams.get('teacherId') || undefined;
  const status = url.searchParams.get('status') || undefined;
  return json({ success: true, data: await getAdminTasks(actor.tenantId!, { teacherId, status }) });
});
