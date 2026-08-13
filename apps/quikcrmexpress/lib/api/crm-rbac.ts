/**
 * Server-side CRM RBAC — CrmExpress's own app_quikcrmexpress RBAC tables
 * (QceAppRole / QceRolePermission / QceUserAppRole / QceUserPermissionExtra),
 * accessed via the qce* Prisma delegates. Repointed from app_quikcrm to
 * complete the de-vendor.
 */
import {
  isCrmAction,
  isCrmModule,
  type CrmAction,
  type CrmModule,
} from "@/lib/api/permissions-registry";
import { getQuikcrmexpressAppId } from "@/lib/api/quikcrmexpress-app";
import { appRoleNameForMembershipRole } from "@/lib/api/permissions-registry";
import { seedAllDefaultCrmRoles } from "@/lib/api/seed-crm-app-roles";
import { isCrmRbacClientReady, rbacDb } from "@/lib/api/crm-rbac-client";
import { mirrorAppRoleToCentral } from "@quikit/auth/assign-app-roles";
import { db } from "@/lib/db";

export { isCrmRbacClientReady } from "@/lib/api/crm-rbac-client";

export async function userCan(
  userId: string,
  orgId: string,
  resource: CrmModule,
  action: CrmAction,
): Promise<boolean> {
  if (!isCrmModule(resource) || !isCrmAction(action)) return false;

  const appId = await getQuikcrmexpressAppId();
  if (!appId) return false;

  const client = rbacDb();
  if (!client) return false;

  const roleHit = await client.qceRolePermission.findFirst({
    where: {
      resource,
      action,
      role: {
        appId,
        members: { some: { userId, orgId } },
      },
    },
    select: { id: true },
  });
  if (roleHit) return true;

  const extraHit = await client.qceUserPermissionExtra.findFirst({
    where: { userId, orgId, resource, action },
    select: { id: true },
  });
  return !!extraHit;
}

export async function ensureUserOnCrmRole(
  userId: string,
  orgId: string,
  roleId: string,
  assignedBy?: string,
): Promise<void> {
  const client = rbacDb();
  if (!client) return;

  const existing = await client.qceUserAppRole.findFirst({
    where: { userId, orgId, roleId },
    select: { id: true },
  });
  if (existing) return;
  await client.qceUserAppRole.create({
    data: { userId, orgId, roleId, assignedBy: assignedBy ?? null },
  });
}

/**
 * True when the user already holds ANY CrmExpress AppRole in this org.
 *
 * Used by the startup bind in `/api/me/permissions` so we only ever seed a
 * role for a user who has none — an existing (possibly deliberately demoted)
 * assignment must never be overwritten. Mirrors the `hasRole` guard in
 * apps/quikscale/app/api/me/permissions/route.ts.
 */
export async function hasAnyCrmAppRole(
  userId: string,
  orgId: string,
): Promise<boolean> {
  const appId = await getQuikcrmexpressAppId();
  if (!appId) return false;

  const client = rbacDb();
  if (!client) return false;

  const hit = await client.qceUserAppRole.findFirst({
    where: { userId, orgId, role: { appId } },
    select: { id: true },
  });
  return !!hit;
}

/**
 * Seed this org's default roles and bind `userId` to one of them if — and only
 * if — they hold no CrmExpress role yet.
 *
 * This is the app-startup safety net every other app already has: QuikScale,
 * QuikTrack and QuikInfra all call their seeder from `/api/me/permissions`, so
 * simply opening the app provisions the org's roles even when the launcher's
 * fire-and-forget `/api/internal/provision-roles` call never landed. CrmExpress
 * had no such hook — `seedAllDefaultCrmRoles` was reachable only from
 * Settings → Users — which is how UAT ended up with an empty
 * `app_quikcrmexpress."AppRole"` table and an empty role dropdown in the
 * Admin Portal.
 *
 * Only ADMIN-TIER callers are auto-bound, exactly as in QuikScale. A non-admin
 * is deliberately left alone: this app resolves permissions as
 * `roleBaselineMatrix(legacyRole) ∪ rbacGrants ∪ templates`
 * (lib/auth/permissions.ts `getEffectiveMatrix`), so binding, say, a
 * FinanceUser to the default `sales-user` role would ADD sales grants their
 * legacy baseline never gave them. Non-admin bindings stay owned by the flows
 * that know the intended role — `syncUserCrmAppRole` (Settings → Users),
 * `assignAppRoles` (Admin Portal) and `/api/internal/provision-roles`.
 *
 * The seed itself is unconditional, which is the part that matters for the
 * Admin Portal: the org's roles must exist whether or not this caller needs a
 * binding.
 */
export async function ensureCrmRolesForOrg(
  userId: string,
  orgId: string,
  isAdminTier: boolean,
): Promise<void> {
  if (!isCrmRbacClientReady()) return;

  const { adminRoleId } = await seedAllDefaultCrmRoles(orgId);
  if (!isAdminTier) return;
  if (await hasAnyCrmAppRole(userId, orgId)) return;

  await ensureUserOnCrmRole(userId, orgId, adminRoleId);
}

/**
 * Replace the user's CrmExpress app roles in this org with a single role
 * matching their org membership role (Administrator -> admin, etc.).
 */
export async function syncUserCrmAppRole(
  userId: string,
  orgId: string,
  membershipRole: string,
  assignedBy?: string,
): Promise<void> {
  if (!isCrmRbacClientReady()) return;

  await seedAllDefaultCrmRoles(orgId);
  const appId = await getQuikcrmexpressAppId();
  if (!appId) return;

  const client = rbacDb();
  if (!client) return;

  const roleName = appRoleNameForMembershipRole(membershipRole);
  const role = await client.qceAppRole.findFirst({
    where: { orgId, appId, name: roleName },
    select: { id: true },
  });
  if (!role) return;

  await client.qceUserAppRole.deleteMany({
    where: { userId, orgId, role: { appId } },
  });
  await ensureUserOnCrmRole(userId, orgId, role.id, assignedBy);

  // Keep the central `quikit.UserAppAccess.role` mirror — the value the Admin
  // Portal renders under "Roles per Application" — in step with the role just
  // assigned here. QuikScale, QuikTrack and QuikInfra all do this from their
  // own role-change handlers; CrmExpress did not, so a role changed inside
  // Settings → Users left the Admin Portal displaying the previous one
  // indefinitely. This is the app → Admin-Portal direction of the sync;
  // @quikit/auth/assign-app-roles owns the opposite direction.
  await mirrorAppRoleToCentral(db, { orgId, userId, appId, roleName });
}

export interface CrmEffectiveGrant {
  resource: string;
  action: string;
}

/** Union of role grants + per-user extras for matrix building. */
export async function loadUserCrmGrants(
  userId: string,
  orgId: string,
): Promise<CrmEffectiveGrant[]> {
  const appId = await getQuikcrmexpressAppId();
  if (!appId) return [];

  const client = rbacDb();
  if (!client) return [];

  const [userRoles, extras] = await Promise.all([
    client.qceUserAppRole.findMany({
      where: { userId, orgId, role: { appId } },
      select: {
        role: {
          select: {
            permissions: { select: { resource: true, action: true } },
          },
        },
      },
    }),
    client.qceUserPermissionExtra.findMany({
      where: { userId, orgId },
      select: { resource: true, action: true },
    }),
  ]);

  const seen = new Set<string>();
  const out: CrmEffectiveGrant[] = [];
  const push = (resource: string, action: string) => {
    const key = `${resource}:${action}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ resource, action });
  };

  for (const ur of userRoles) {
    for (const p of ur.role.permissions) push(p.resource, p.action);
  }
  for (const e of extras) push(e.resource, e.action);
  return out;
}