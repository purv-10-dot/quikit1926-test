/**
 * Default role seeders for QuikSupport's standard QuikIT RBAC tables
 * (app_quiksupport.AppRole / RolePermission / RoleNavigation / UserAppRole,
 * modelled in Prisma as Qsp*). Mirrors quikscale/quiktrack's seedAdminAppRole.
 *
 * This is the QuikIT permission layer (the one the admin portal manages via
 * `/api/roles?appSlug=quiksupport`). It coexists with the helpdesk's own Hd*
 * domain RBAC. Seeders are idempotent; the in-process cache keeps the
 * per-request lazy seed cheap.
 */
import { db } from "@/lib/db";
import { ALL_PERMISSIONS } from "@/lib/rbac";
// Sidebar/nav keys live in the shared registry (single source of truth,
// also consumed by lib/api/permissions.ts). Match manifest.ts navigation + views.
import { NAV_KEYS, MEMBER_NAV } from "@/lib/api/permissionsRegistry";

let cachedAppId: string | null = null;

/** Resolve QuikSupport's central App.id (slug = "quiksupport"). */
export async function getQuikSupportAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  const app = await db.app.findUnique({ where: { slug: "quiksupport" }, select: { id: true } });
  cachedAppId = app?.id ?? null;
  return cachedAppId;
}

/** System "admin" role — all helpdesk permissions + all navigation. */
export async function seedAdminAppRole(orgId: string): Promise<string> {
  const appId = await getQuikSupportAppId();
  if (!appId) throw new Error("QuikSupport App not registered in quikit.App");

  const existing = await db.qspAppRole.findFirst({
    where: { orgId, appId, name: "admin" },
    select: { id: true },
  });
  const role =
    existing ??
    (await db.qspAppRole.create({
      data: {
        orgId,
        appId,
        name: "admin",
        description: "Full helpdesk administration — auto-seeded. Permissions editable; rename/delete protected.",
        isSystem: true,
        isDefault: false,
      },
      select: { id: true },
    }));

  if ((await db.qspRolePermission.count({ where: { roleId: role.id } })) === 0) {
    await db.qspRolePermission.createMany({
      data: ALL_PERMISSIONS.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
      skipDuplicates: true,
    });
  }
  if ((await db.qspRoleNavigation.count({ where: { roleId: role.id } })) === 0) {
    await db.qspRoleNavigation.createMany({
      data: NAV_KEYS.map((navKey) => ({ roleId: role.id, navKey })),
      skipDuplicates: true,
    });
  }
  return role.id;
}

/** Default "Member" role — raise/track tickets. New members auto-land here. */
export async function seedMemberAppRole(orgId: string): Promise<string> {
  const appId = await getQuikSupportAppId();
  if (!appId) throw new Error("QuikSupport App not registered in quikit.App");

  const existing =
    (await db.qspAppRole.findFirst({
      where: { orgId, appId, isDefault: true, isSystem: false },
      select: { id: true },
    })) ??
    (await db.qspAppRole.findFirst({
      where: { orgId, appId, name: "Member" },
      select: { id: true },
    }));

  const role =
    existing ??
    (await db.qspAppRole.create({
      data: {
        orgId,
        appId,
        name: "Member",
        description: "Raise and track support tickets. Default role for new members.",
        isSystem: false,
        isDefault: true,
      },
      select: { id: true },
    }));

  if ((await db.qspRolePermission.count({ where: { roleId: role.id } })) === 0) {
    const memberPerms = ALL_PERMISSIONS.filter((p) => p.key === "ticket.create");
    await db.qspRolePermission.createMany({
      data: memberPerms.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
      skipDuplicates: true,
    });
  }
  if ((await db.qspRoleNavigation.count({ where: { roleId: role.id } })) === 0) {
    await db.qspRoleNavigation.createMany({
      data: MEMBER_NAV.map((navKey) => ({ roleId: role.id, navKey })),
      skipDuplicates: true,
    });
  }
  return role.id;
}

/** Assign a user to an app-wide role (idempotent). */
export async function ensureUserOnRole(
  userId: string,
  orgId: string,
  roleId: string,
  assignedBy?: string,
): Promise<void> {
  const existing = await db.qspUserAppRole.findFirst({
    where: { userId, orgId, roleId },
    select: { id: true },
  });
  if (existing) return;
  await db.qspUserAppRole.create({
    data: { userId, orgId, roleId, assignedBy: assignedBy ?? null },
  });
}

const seededOrgs = new Map<string, number>();
const SEED_CACHE_TTL_MS = 5 * 60 * 1000;

/** Seed the org's default roles (admin + Member). Idempotent + cached. */
export async function seedAllDefaultRoles(
  orgId: string,
): Promise<{ adminRoleId: string; userRoleId: string }> {
  const now = Date.now();
  const appId = await getQuikSupportAppId();
  const cached = seededOrgs.get(orgId);
  if (cached && now - cached < SEED_CACHE_TTL_MS && appId) {
    const [admin, member] = await Promise.all([
      db.qspAppRole.findFirst({ where: { orgId, appId, name: "admin" }, select: { id: true } }),
      db.qspAppRole.findFirst({
        where: { orgId, appId, OR: [{ isDefault: true, isSystem: false }, { name: "Member" }] },
        select: { id: true },
      }),
    ]);
    if (admin && member) return { adminRoleId: admin.id, userRoleId: member.id };
  }
  const [adminRoleId, userRoleId] = await Promise.all([seedAdminAppRole(orgId), seedMemberAppRole(orgId)]);
  seededOrgs.set(orgId, now);
  return { adminRoleId, userRoleId };
}
