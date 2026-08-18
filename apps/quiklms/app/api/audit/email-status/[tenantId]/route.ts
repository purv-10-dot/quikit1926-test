import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles, assertOrgAccess } from '@/lib/auth/context';
import { getEmailDeliveryStatus } from '@/lib/services/audit-service';

// GET /api/audit/email-status/:orgId — ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);
  // The org is named in the URL and the role check was the only gate — so any
  // holder of the ADMIN role could target another org by editing the path.
  await assertOrgAccess(actor, params!.tenantId);
  try {
    return json({ success: true, data: await getEmailDeliveryStatus(params!.tenantId) });
  } catch (e) {
    throw BadRequest(e instanceof Error ? e.message : 'Failed to get email status');
  }
});
