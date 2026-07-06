import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getBatchReport } from '@/lib/services/attendance-service';

// GET /api/attendance/batch/:batchId/report — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const url = new URL(req.url);
  return json(
    await getBatchReport(
      actor.tenantId!,
      params!.batchId,
      url.searchParams.get('startDate') || undefined,
      url.searchParams.get('endDate') || undefined,
    ),
  );
});
