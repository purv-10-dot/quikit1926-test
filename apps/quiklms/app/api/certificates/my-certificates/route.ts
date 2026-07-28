import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getLearnerCertificates } from '@/lib/services/certificates-service';

// GET /api/certificates/my-certificates — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN | MANAGER | LEARNER
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'LEARNER']);
  if (!user.id) throw new Error('User ID is required');
  if (!user.orgId) return json({ success: true, data: [] });
  return json({ success: true, data: await getLearnerCertificates(user.orgId, user.id) });
});
