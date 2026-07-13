import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { searchUsers } from '@/lib/services/users-service';

// GET /api/users/search?q=&role= — any authenticated user (messaging, pickers)
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || undefined;
  const role = url.searchParams.get('role') || undefined;
  const orgId = actor.role === 'SUPER_ADMIN' ? undefined : actor.orgId ?? undefined;
  const excludeRoles = actor.tenantType === 'corporate' ? ['TEACHER', 'PARENT'] : [];
  return json({ success: true, data: await searchUsers(orgId, q, role, excludeRoles) });
});
