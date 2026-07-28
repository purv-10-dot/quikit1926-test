import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findBySubmittedTenant } from '@/lib/services/certificates-service';

// GET /api/certificates/my-submissions — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['TENANT_ADMIN', 'SUB_ADMIN']);
  return json({ success: true, data: await findBySubmittedTenant(user.orgId ?? '') });
});
