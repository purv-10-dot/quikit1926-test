import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles, assertOrgAccess } from '@/lib/auth/context';
import { previewUpgradeInvoice } from '@/lib/services/audit-service';

// GET /api/audit/upgrade-invoice/preview/:orgId — SUPER_ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN']);
  // The org is named in the URL and the role check was the only gate — so any
  // holder of the SUPER_ADMIN role could target another org by editing the path.
  await assertOrgAccess(actor, params!.tenantId);
  try {
    return json({ success: true, data: await previewUpgradeInvoice(params!.tenantId) });
  } catch (e) {
    throw BadRequest(e instanceof Error ? e.message : 'Failed to preview upgrade invoice');
  }
});
