import { route, json, BadRequest, Forbidden } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getStorageUsage } from '@/lib/services/tenants-service';

const TEN_GB = 10 * 1024 * 1024 * 1024;
const TEN_MB = 10 * 1024 * 1024;

// GET /api/tenants/storage-check — ADMIN | TENANT_ADMIN | SUB_ADMIN | MANAGER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER']);
  const orgId = actor.orgId;

  if (!orgId && actor.role === 'ADMIN') {
    return json({ success: true, data: { canUpload: true, availableSpace: TEN_GB, usedSpace: 0, totalSpace: TEN_GB }, message: 'Storage available for upload' });
  }
  if (!orgId) throw BadRequest('Tenant ID is required');

  const usage = await getStorageUsage(orgId);
  const availableSpace = usage.storageLimit - usage.currentUsage;
  if (availableSpace < TEN_MB) {
    // A bare message is CORRECT here, despite appearances. The legacy handler
    // threw `ForbiddenException({success, message, data:{canUpload,…}})`
    // (`tenants.controller.ts:246-255`), but the global AllExceptionsFilter
    // rebuilt every error body from scratch and copied only `message` / `error` /
    // `errors` / `validationErrors` off it (`all-exceptions.filter.ts:39-54`).
    // `data` and `success` were dropped before the response was ever sent, so no
    // client ever saw canUpload/availableSpace/usedSpace/totalSpace on the 403.
    // Adding them here would be a new feature, not parity.
    throw Forbidden('Storage limit exceeded. Please free up space or contact your administrator.');
  }
  return json({
    success: true,
    data: { canUpload: true, availableSpace, usedSpace: usage.currentUsage, totalSpace: usage.storageLimit },
    message: 'Storage available for upload',
  });
});
