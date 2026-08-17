/**
 * RBAC v2 permission gate — the QuikScale role model, expressed on QuikLMS's own
 * tables and helpers.
 *
 * Storage model (identical in shape to `apps/quikscale/lib/api/permissions.ts`,
 * which is the reference implementation per the rule book):
 *   - Roles                          → `app_quiklms.AppRole`        (LmsAppRole)
 *   - User → role mapping            → `app_quiklms.UserAppRole`    (LmsUserAppRole)
 *   - Role grants (resource, action) → `app_quiklms.RolePermission` (LmsRolePermission)
 *   - Per-user grants                → `app_quiklms.UserPermissionExtra`
 *
 * WHY THIS EXISTS. QuikLMS authorises off the coarse role enum: 292
 * `requireRoles(actor, [...])` calls across 264 route files, with the role itself
 * resolved through a three-tier fallback (assignment → `LmsUser.role` →
 * `OrgMember.role`). That fallback is what let a role silently change under a
 * signed-in user when the LMS tables were emptied, and it cannot express "this
 * role may view courses but not delete them" at all. QuikScale has no fallback and
 * no role enum in its guards — it asks `userCan(user, org, resource, action)` and
 * fails closed. These four tables were already in the schema for QuikLMS; nothing
 * ever read or wrote them (0 RolePermission rows against QuikScale's 1,922).
 *
 * ONE DELIBERATE DIFFERENCE FROM QUIKSCALE. `LmsUserPermissionExtra` carries a
 * `kind` of GRANT | DENY, which QuikScale's table does not have. A DENY row must
 * therefore be able to override a role grant, or the column would be a silent
 * no-op that reads like a revocation to whoever set it. Precedence is:
 *
 *     DENY extra  >  role grant  ∪  GRANT extra
 *
 * NOT WIRED INTO ANY GUARD YET. Phase 1 is additive on purpose: `requireRoles`
 * still decides every request. `wouldDenyUnderRbacV2` below is the shadow probe
 * that reports where this model would disagree, so the matrix can be proven
 * against real traffic before it gates anything.
 */
import { db } from '@/lib/db';
import { ACTIONS, type Action, isAction } from '@/lib/auth/permissions-registry';

/** The platform App row for this app — grants are scoped to it, as in quikscale. */
const QUIKLMS_APP_SLUG = 'quiklms';

let cachedAppId: string | null | undefined;
async function getQuikLmsAppId(): Promise<string | null> {
  if (cachedAppId !== undefined) return cachedAppId ?? null;
  const app = await db.app.findFirst({ where: { slug: QUIKLMS_APP_SLUG }, select: { id: true } });
  cachedAppId = app?.id ?? null;
  return cachedAppId;
}

/**
 * True if `userId` holds the protected system role in this org.
 *
 * Separate from `userCan` for the same reason quikscale keeps `isOrgAdmin`
 * separate: it ignores `UserPermissionExtra` entirely. An additive per-user grant
 * is not a promotion, so a route that must ask "is this person an admin?" — rather
 * than "may they do X?" — cannot be satisfied by handing someone one extra grant.
 */
export async function isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const appId = await getQuikLmsAppId();
  if (!appId) return false;
  const hit = await db.lmsUserAppRole.findFirst({
    where: { userId, orgId, role: { appId, isSystem: true, name: 'admin' } },
    select: { id: true },
  });
  return !!hit;
}

/**
 * May `userId` perform `action` on `resource` in this org?
 *
 * Resolution order:
 *   1. A DENY `UserPermissionExtra` → refuse outright, whatever the role says.
 *   2. A `RolePermission` on any role the user holds (via the `members` join).
 *   3. A GRANT `UserPermissionExtra` scoped to (userId, orgId).
 *
 * No admin bypass — `admin` passes because its seeded grants say so, exactly as in
 * quikscale. Instance-level rules ("only your own homework") stay in the
 * per-feature helpers above this layer; this answers the class-level question only.
 *
 * Fails CLOSED: an unknown action, a missing App row, or a user with no
 * assignments all return false.
 */
export async function userCan(
  userId: string,
  orgId: string,
  resource: string,
  action: Action,
): Promise<boolean> {
  if (!userId || !orgId || !resource || !isAction(action)) return false;

  const appId = await getQuikLmsAppId();
  if (!appId) return false;

  const denied = await db.lmsUserPermissionExtra.findFirst({
    where: { userId, orgId, resource, action, kind: 'DENY' },
    select: { id: true },
  });
  if (denied) return false;

  const roleHit = await db.lmsRolePermission.findFirst({
    where: { resource, action, role: { appId, members: { some: { userId, orgId } } } },
    select: { id: true },
  });
  if (roleHit) return true;

  const granted = await db.lmsUserPermissionExtra.findFirst({
    where: { userId, orgId, resource, action, kind: 'GRANT' },
    select: { id: true },
  });
  return !!granted;
}

export interface MyPermissions {
  /** True iff the user holds the protected system role. */
  isAdmin: boolean;
  /** First role assigned, by `assignedAt` — the "primary" one, as in quikscale. */
  roleId: string | null;
  roleName: string | null;
  /** `${resource}:${action}` — role grants ∪ GRANT extras, minus DENY extras. */
  permissions: string[];
  /** The subset that came from a per-user GRANT rather than a role. */
  extras: string[];
}

const EMPTY_PERMISSIONS: MyPermissions = {
  isAdmin: false,
  roleId: null,
  roleName: null,
  permissions: [],
  extras: [],
};

/**
 * The effective permission set, for a `/api/me/permissions`-style endpoint to
 * hand the client so the UI can hide what the API would refuse.
 *
 * QuikLMS has no such endpoint today, which is the other half of the "admin menu
 * over a learner session" problem: the sidebar derives its role from
 * a client-writable role cookie and never consults the server.
 */
export async function loadMyPermissions(userId: string, orgId: string): Promise<MyPermissions> {
  const appId = await getQuikLmsAppId();
  if (!appId || !userId || !orgId) return EMPTY_PERMISSIONS;

  const [assignments, extras] = await Promise.all([
    db.lmsUserAppRole.findMany({
      where: { userId, orgId, role: { appId } },
      select: {
        role: {
          select: {
            id: true,
            name: true,
            isSystem: true,
            permissions: { select: { resource: true, action: true } },
          },
        },
      },
      orderBy: { assignedAt: 'asc' },
    }),
    db.lmsUserPermissionExtra.findMany({
      where: { userId, orgId },
      select: { resource: true, action: true, kind: true },
    }),
  ]);

  if (assignments.length === 0 && extras.length === 0) return EMPTY_PERMISSIONS;

  const primary = assignments[0]?.role ?? null;
  const isAdmin = assignments.some((a) => a.role.isSystem && a.role.name === 'admin');

  const effective = new Set<string>();
  for (const a of assignments) {
    for (const p of a.role.permissions) effective.add(`${p.resource}:${p.action}`);
  }

  const grantedExtras: string[] = [];
  for (const e of extras) {
    if (e.kind !== 'GRANT') continue;
    const key = `${e.resource}:${e.action}`;
    grantedExtras.push(key);
    effective.add(key);
  }
  // DENY last so it wins over both sources — same precedence as `userCan`.
  for (const e of extras) {
    if (e.kind === 'DENY') effective.delete(`${e.resource}:${e.action}`);
  }

  return {
    isAdmin,
    roleId: primary?.id ?? null,
    roleName: primary?.name ?? null,
    permissions: [...effective].sort(),
    extras: grantedExtras.sort(),
  };
}

/**
 * Every `${resource}:${action}` this org grants to the AppRole named `roleName`.
 *
 * WHY THIS IS SEPARATE FROM `loadMyPermissions`. That one answers "what may THIS
 * USER do", from their `UserAppRole` assignments — which is an empty set for a
 * user with no assignment row (e.g. the platform operator, who is cross-tenant
 * and has none by nature). `requireAuth` falls back to this — the grants of the
 * role they RESOLVED to — for exactly that case.
 *
 * Role-scoped, not user-scoped, so it deliberately ignores `UserPermissionExtra`:
 * per-user GRANT/DENY rows are already applied by `loadMyPermissions`, and a DENY
 * must not be re-granted by coming in through a second path.
 *
 * Fails CLOSED — an unseeded role or a missing App row is an empty set.
 */
export async function loadRoleGrants(orgId: string, roleName: string): Promise<string[]> {
  if (!orgId || !roleName) return [];

  const appId = await getQuikLmsAppId();
  if (!appId) return [];

  const rows = await db.lmsRolePermission.findMany({
    where: { role: { orgId, appId, name: roleName } },
    select: { resource: true, action: true },
  });
  return rows.map((r) => `${r.resource}:${r.action}`);
}

/**
 * SHADOW PROBE — phase 1 only, and read-only.
 *
 * Answers "would RBAC v2 have refused this request?" without affecting it. A user
 * who is allowed today but would be denied here is a migration blocker: either
 * their `UserAppRole` row is missing, or the matrix is short a grant. Logging that
 * across real traffic is what makes flipping the guards over safe.
 *
 * Never throws — a shadow check must not be able to fail a live request.
 */
export async function wouldDenyUnderRbacV2(
  userId: string,
  orgId: string | null | undefined,
  resource: string,
  action: Action,
): Promise<boolean> {
  try {
    if (!orgId) return true;
    return !(await userCan(userId, orgId, resource, action));
  } catch {
    return false; // Unknown → do not report a phantom blocker.
  }
}

export { ACTIONS };
