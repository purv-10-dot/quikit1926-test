import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTenantIssuedCertificates } from '@/lib/services/certificates-service';

// GET /api/certificates/tenant/issued-certificates — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN | MANAGER
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER']);
  if (!user.tenantId) return json({ success: true, data: [], count: 0 });
  const certificates = await getTenantIssuedCertificates(user.tenantId);
  return json({ success: true, data: certificates, count: certificates.length });
});
