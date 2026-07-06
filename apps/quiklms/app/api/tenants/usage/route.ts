import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getStorageUsage } from '@/lib/services/tenants-service';

// GET /api/tenants/usage — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const tenantId = actor.tenantId;
  if (!tenantId && actor.role === 'SUPER_ADMIN') {
    return json({ success: true, data: { currentUsage: 0, storageLimit: 10 * 1024 * 1024 * 1024 } });
  }
  if (!tenantId) throw BadRequest('Tenant ID is required');
  return json({ success: true, data: await getStorageUsage(tenantId) });
});
