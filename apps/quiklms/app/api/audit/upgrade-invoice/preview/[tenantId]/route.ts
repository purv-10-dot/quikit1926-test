import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { previewUpgradeInvoice } from '@/lib/services/audit-service';

// GET /api/audit/upgrade-invoice/preview/:orgId — SUPER_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  try {
    return json({ success: true, data: await previewUpgradeInvoice(params!.tenantId) });
  } catch (e) {
    throw BadRequest(e instanceof Error ? e.message : 'Failed to preview upgrade invoice');
  }
});
