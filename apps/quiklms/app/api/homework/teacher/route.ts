import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTeacherHomework } from '@/lib/services/homework-service';

// GET /api/homework/teacher — TEACHER | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  return json(
    await getTeacherHomework(actor.orgId!, actor.id, {
      status: url.searchParams.get('status') || undefined,
      batchId: url.searchParams.get('batchId') || undefined,
    }),
  );
});
