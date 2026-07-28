import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTenantStorageBreakdown } from '@/lib/services/audit-service';

// GET /api/audit/storage/tenants — SUPER_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  try {
    return json({ success: true, data: await getTenantStorageBreakdown() });
  } catch (e) {
    throw BadRequest(e instanceof Error ? e.message : 'Failed to fetch tenant storage breakdown');
  }
});
