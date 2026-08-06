import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getAdminEscalations } from '@/lib/services/escalations-service';

// GET /api/escalations/admin?status=&from=&to= — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  return json(
    await getAdminEscalations(actor.orgId!, {
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    }),
  );
});
