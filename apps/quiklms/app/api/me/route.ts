import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/me — current authenticated user.
 *
 * Single source of truth for client-side identity. The client providers fetch
 * this on load and mirror it into sessionStorage('user') so the many pages that
 * read `user.orgId` / `user._id` / `user.managerId` / `user.childIds` work
 * under the cookie-based auth (which never set sessionStorage before).
 *
 * Returns both `id` and `_id` (Mongo-era alias still read by ported pages).
 */
export const GET = route(async (req) => {
  const actor = await requireAuth(req);

  // Hydrate from the DB when the user is a real seed row; fall back to the
  // dev-auth context for super-admins / rows that aren't persisted.
  const db = actor.id
    ? await prisma.lmsUser.findUnique({
        where: { id: actor.id },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, secondaryRole: true, orgId: true, managerId: true, isActive: true },
      })
    : null;

  // Resolve childIds for parents (UserParent graph) so the parent portal can
  // load its children without a separate broken sessionStorage read.
  let childIds: string[] = [];
  if (actor.role === 'PARENT') {
    const links = await prisma.lmsUserParent.findMany({ where: { parentId: actor.id }, select: { childId: true } });
    childIds = links.map((l) => l.childId);
  }

  const user = {
    id: actor.id,
    _id: actor.id,
    email: db?.email ?? actor.email,
    firstName: db?.firstName ?? actor.firstName,
    lastName: db?.lastName ?? actor.lastName,
    role: db?.role ?? actor.role,
    secondaryRole: db?.secondaryRole ?? actor.secondaryRole,
    orgId: db?.orgId ?? actor.orgId,
    tenantType: actor.tenantType,
    managerId: db?.managerId ?? null,
    childIds,
    isActive: db?.isActive ?? actor.isActive,
  };

  return json({ success: true, data: user });
});
