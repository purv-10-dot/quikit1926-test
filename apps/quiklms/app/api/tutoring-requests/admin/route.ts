import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getForAdmin } from '@/lib/services/tutoring-requests-service';

// GET /api/tutoring-requests/admin?status=&studentId=&teacherId= — TENANT_ADMIN | SUB_ADMIN | ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'ADMIN']);
  const url = new URL(req.url);
  return json(
    await getForAdmin(actor.orgId!, {
      status: url.searchParams.get('status') || undefined,
      studentId: url.searchParams.get('studentId') || undefined,
      teacherId: url.searchParams.get('teacherId') || undefined,
    }),
  );
});
