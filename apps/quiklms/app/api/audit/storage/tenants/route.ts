import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles, visibleOrgIds } from '@/lib/auth/context';
import { getTenantStorageBreakdown } from '@/lib/services/audit-service';

// GET /api/audit/storage/tenants — SUPER_ADMIN. Scoped: unscoped this returned a row
// per tenant (org name, storage, last activity) — a directory of every customer on the
// platform — to anyone holding the role.
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  try {
    return json({ success: true, data: await getTenantStorageBreakdown(await visibleOrgIds(actor)) });
  } catch (e) {
    throw BadRequest(e instanceof Error ? e.message : 'Failed to fetch tenant storage breakdown');
  }
});
