import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { db } from '@/lib/db';
import { ensureLmsAppRolesSeeded } from '@/lib/api/seed-lms-app-roles';
import { ensureLmsRbacSeeded } from '@/lib/api/seed-lms-permissions';

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

  // Lazy default-role generation (safety net) — mirrors how quikscale/quiktrack
  // seed on GET /api/me/permissions. Ensures every org that uses QuikLMS has its
  // default AppRole catalogue so the Admin Portal role dropdown is populated and
  // assignAppRoles can resolve roles, even for orgs granted access outside the
  // launcher/onboarding paths. Best-effort + cached per process; seeds the role
  // CATALOGUE only — it never auto-assigns a role (LmsUser.role stays the
  // authoritative source for provisioned users), so no user's role can change.
  if (actor.orgId) {
    try {
      await ensureLmsAppRolesSeeded(actor.orgId);
      // …and the grants behind the catalogue. Authorisation fails closed now, so an
      // org with roles but no `RolePermission` rows refuses every request. This is
      // the lazy safety net for an org provisioned before the cutover or by a path
      // that predates it; both are per-process cached, so it is a no-op after the
      // first load rather than 392 grants on every page view.
      await ensureLmsRbacSeeded(actor.orgId);
    } catch {
      /* advisory — retried on the next load; provision-roles is the eager path */
    }
  }

  // Hydrate from the DB when the user is a real seed row; fall back to the
  // dev-auth context for super-admins / rows that aren't persisted.
  const dbUser = actor.id
    ? await db.lmsUser.findUnique({
        where: { id: actor.id },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, secondaryRole: true, orgId: true, managerId: true, isActive: true },
      })
    : null;

  // Resolve childIds for parents (UserParent graph) so the parent portal can
  // load its children without a separate broken sessionStorage read.
  let childIds: string[] = [];
  if (actor.role === 'PARENT') {
    const links = await db.lmsUserParent.findMany({ where: { parentId: actor.id }, select: { childId: true } });
    childIds = links.map((l) => l.childId);
  }

  const user = {
    id: actor.id,
    _id: actor.id,
    email: dbUser?.email ?? actor.email,
    firstName: dbUser?.firstName ?? actor.firstName,
    lastName: dbUser?.lastName ?? actor.lastName,
    /**
     * The ACTIVE role, not the `LmsUser.role` column.
     *
     * This read `dbUser?.role ?? actor.role`, which meant the client was told the
     * user's PRIMARY role even after they switched — so a teacher who switched to
     * Sub Admin got sub-admin pages driven by a `user.role` of TEACHER. `actor.role`
     * is itself resolved from that same row (getAuthContext reads it), so nothing is
     * lost by preferring it, and `primaryRole` below keeps the raw column available.
     */
    role: actor.role,
    /** The `LmsUser.role` column — the role they are when not switched. */
    primaryRole: dbUser?.role ?? actor.roles[0],
    secondaryRole: dbUser?.secondaryRole ?? actor.secondaryRole,
    /**
     * Every role they may act as, default first. The header switcher renders from
     * THIS rather than from `localStorage.qs_roles`, which is what let the role set
     * go stale (and vanish) across a switch. See components/AppShell.tsx.
     */
    roles: actor.roles,
    orgId: dbUser?.orgId ?? actor.orgId,
    tenantType: actor.tenantType,
    managerId: dbUser?.managerId ?? null,
    childIds,
    isActive: dbUser?.isActive ?? actor.isActive,
  };

  return json({ success: true, data: user });
});
