import { route, json, BadRequest, Forbidden } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getStorageUsage } from '@/lib/services/tenants-service';

const TEN_GB = 10 * 1024 * 1024 * 1024;
const TEN_MB = 10 * 1024 * 1024;

// GET /api/tenants/storage-check — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN | MANAGER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER']);
  const orgId = actor.orgId;

  if (!orgId && actor.role === 'SUPER_ADMIN') {
    return json({ success: true, data: { canUpload: true, availableSpace: TEN_GB, usedSpace: 0, totalSpace: TEN_GB }, message: 'Storage available for upload' });
  }
  if (!orgId) throw BadRequest('Tenant ID is required');

  const usage = await getStorageUsage(orgId);
  const availableSpace = usage.storageLimit - usage.currentUsage;
  if (availableSpace < TEN_MB) {
    throw Forbidden('Storage limit exceeded. Please free up space or contact your administrator.');
  }
  return json({
    success: true,
    data: { canUpload: true, availableSpace, usedSpace: usage.currentUsage, totalSpace: usage.storageLimit },
    message: 'Storage available for upload',
  });
});
