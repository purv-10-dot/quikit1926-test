import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findPendingApprovals } from '@/lib/services/certificates-service';

// GET /api/certificates/pending-approvals — SUPER_ADMIN
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN']);
  return json({ success: true, data: await findPendingApprovals() });
});
