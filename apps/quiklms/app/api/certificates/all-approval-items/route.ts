import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findAllApprovalItems } from '@/lib/services/certificates-service';

// GET /api/certificates/all-approval-items — SUPER_ADMIN
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN']);
  return json({ success: true, data: await findAllApprovalItems() });
});
