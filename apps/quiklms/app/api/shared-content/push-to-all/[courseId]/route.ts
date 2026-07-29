import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { pushToAllTenants } from '@/lib/services/shared-content-service';

// POST /api/shared-content/push-to-all/:courseId — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const result = await pushToAllTenants(params!.courseId);
  return json({ success: true, data: result, message: `Course shared with ${result.sharedCount} tenants` });
});
