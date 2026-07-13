import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findAllUsers } from '@/lib/services/users-service';

// GET /api/users?search=&role= — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const url = new URL(req.url);
  const search = url.searchParams.get('search') || undefined;
  const role = url.searchParams.get('role') || undefined;
  const orgId = actor.role === 'SUPER_ADMIN' ? undefined : actor.orgId ?? undefined;
  const excludeRoles = actor.role !== 'SUPER_ADMIN' && actor.tenantType === 'corporate' ? ['TEACHER', 'PARENT'] : [];
  return json({ success: true, data: await findAllUsers(orgId, search, role, excludeRoles) });
});
