import { route, json } from '@/lib/http';
import { requireAuth, requireRoles, orgScope } from '@/lib/auth/context';
import { findAllUsers } from '@/lib/services/users-service';
import { applyTeacherPrivacy } from '@/lib/privacy';

// GET /api/users?search=&role= — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const search = url.searchParams.get('search') || undefined;
  const role = url.searchParams.get('role') || undefined;
  const orgId = orgScope(actor);
  const excludeRoles =
    actor.isSuperAdmin !== true && actor.tenantType === 'corporate' ? ['TEACHER', 'PARENT'] : [];
  const users = await findAllUsers(orgId, search, role, excludeRoles);
  return json({ success: true, data: await applyTeacherPrivacy(actor, req, users) });
});
