import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getGlobalStorageUsage } from '@/lib/services/audit-service';

// GET /api/audit/storage/global — SUPER_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  try {
    return json({ success: true, data: await getGlobalStorageUsage() });
  } catch (e) {
    throw BadRequest(e instanceof Error ? e.message : 'Failed to fetch global storage usage');
  }
});
