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