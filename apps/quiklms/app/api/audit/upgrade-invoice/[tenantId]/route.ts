import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles, assertOrgAccess } from '@/lib/auth/context';
import { sendUpgradeInvoice } from '@/lib/services/audit-service';

// POST /api/audit/upgrade-invoice/:orgId — ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);
  // The org is named in the URL and the role check was the only gate — so any
  // holder of the ADMIN role could target another org by editing the path.
  await assertOrgAccess(actor, params!.tenantId);
  try {
    const result = await sendUpgradeInvoice(params!.tenantId);
    return json({
      success: result.success,
      message: result.success
        ? 'Upgrade invoice email sent successfully'
        : 'Failed to send upgrade invoice email',
      data: result,
    });
  } catch (e) {
    throw BadRequest(e instanceof Error ? e.message : 'Failed to send upgrade invoice');
  }
});
