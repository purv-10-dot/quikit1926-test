import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getSessionJoinTimestamps } from '@/lib/services/scheduling-service';

// GET /api/scheduling/admin/session-join-timestamps — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const limit = url.searchParams.get('limit');
  return json(
    await getSessionJoinTimestamps(actor.orgId!, {
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
      batchId: url.searchParams.get('batchId') || undefined,
      teacherId: url.searchParams.get('teacherId') || undefined,
      limit: limit ? Number(limit) : undefined,
    }),
  );
});
