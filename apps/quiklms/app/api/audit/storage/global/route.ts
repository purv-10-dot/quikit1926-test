import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles, visibleOrgIds } from '@/lib/auth/context';
import { getGlobalStorageUsage } from '@/lib/services/audit-service';

// GET /api/audit/storage/global — SUPER_ADMIN, scoped to the orgs this caller may see
// (their own plus the ones they onboarded) unless they are the platform operator. See
// lib/auth/context.ts `visibleOrgIds`.
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  try {
    return json({ success: true, data: await getGlobalStorageUsage(await visibleOrgIds(actor)) });
  } catch (e) {
    throw BadRequest(e instanceof Error ? e.message : 'Failed to fetch global storage usage');
  }
});
