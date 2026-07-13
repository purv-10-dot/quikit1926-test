import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getComplianceAnalytics } from '@/lib/services/compliance-service';

// GET /api/compliance/analytics — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['TENANT_ADMIN', 'SUB_ADMIN']);
  const analytics = await getComplianceAnalytics(user.orgId as string);
  return json({ success: true, data: analytics, message: 'Compliance analytics fetched successfully' });
});
