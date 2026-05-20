/**
 * Default role seeders for the QuikTrack Roles & Permissions v2 system.
 *
 * Mirrors apps/quikscale/lib/api/seedAdminAppRole.ts â€” all rows scoped to
 * QuikTrack's `App.id` so they coexist in the same RBAC tables as QuikScale's
 * without interference.
 *
 * Seeders are idempotent â€” safe to call on every authenticated request
 * (in-process cache below keeps it cheap).
 */
import { db } from "@/lib/db";
import {
  NAV_KEYS,
  NAV_TO_ENTITY,
  allPermissionPairs,
  walkLeaves,
  LEGACY_RESOURCE_BACKFILL,
} from "@/lib/api/permissionsRegistry";
import { getQuikTrackAppId } from "@/lib/api/permissions";

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ admin role â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export async function seedAdminAppRole(orgId: string): Promise<string> {
  const appId = await getQuikTrackAppId();
  if (!appId) throw new Error("QuikTrack App not registered in quikit.App");

  const existing = await db.qtAppRole.findFirst({
    where: { orgId, appId, name: "admin" },
    select: { id: true },
  });
  const role =
    existing ??
    (await db.qtAppRole.create({
      data: {
        orgId,
        appId,
        name: "admin",
        description:
          "Full access â€” auto-seeded. Permissions are editable; rename/delete protected.",
        isSystem: true,
        isDefault: false,
      },
      select: { id: true },
    }));

  const grantCount = await db.qtRolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0) {
    const pairs = allPermissionPairs();
    await db.qtRolePermission.createMany({
      data: pairs.map((p) => ({
        roleId: role.id,
        resource: p.resource,
        action: p.action,
      })),
      skipDuplicates: true,
    });
  }

  const navCount = await db.qtRoleNavigation.count({ where: { roleId: role.id } });
  if (navCount === 0) {
    await db.qtRoleNavigation.createMany({
      // Only seed nav-only keys (home / dashboards / plans). Entity-mapped
      // navs (spaces / timesheet / reports) are derived from view grants and
      // do NOT live in QtRoleNavigation anymore.
      data: NAV_KEYS.filter((k) => !(k in NAV_TO_ENTITY)).map((k) => ({
        roleId: role.id,
        navKey: k,
      })),
      skipDuplicates: true,
    });
  }

  return role.id;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ User role â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/**
 * Default "User" role: view everywhere + update on the day-to-day work
 * surfaces (Issue, IssueComment, Timesheet, Sprint).
 * Marked `isDefault=true` so new invitees auto-land here.
 */
export async function seedUserAppRole(orgId: string): Promise<string> {
  const appId = await getQuikTrackAppId();
  if (!appId) throw new Error("QuikTrack App not registered in quikit.App");

  // Look up the default role under either legacy name ("User") or current name
  // ("Member"). Admins can rename the Member role freely — the seeder only
  // re-creates it if no isDefault role exists yet.
  const existing =
    (await db.qtAppRole.findFirst({
      where: { orgId, appId, isDefault: true, isSystem: false },
      select: { id: true },
    })) ??
    (await db.qtAppRole.findFirst({
      where: { orgId, appId, name: { in: ["Member", "User"] } },
      select: { id: true },
    }));

  const role =
    existing ??
    (await db.qtAppRole.create({
      data: {
        orgId,
        appId,
        name: "Member",
        description:
          "Default team-member role. View everywhere; edit on Issue / Comment / Timesheet / Sprint.",
        isSystem: false,
        isDefault: true,
      },
      select: { id: true },
    }));

  const grantCount = await db.qtRolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0) {
    const grants: Array<{ resource: string; action: string }> = [];
    for (const leaf of walkLeaves()) {
      if ((leaf.actions as readonly string[]).includes("view")) {
        grants.push({ resource: leaf.resource, action: "view" });
      }
    }
    for (const resource of ["Issue", "IssueComment", "Timesheet", "Sprint"]) {
      grants.push({ resource, action: "update" });
    }
    await db.qtRolePermission.createMany({
      data: grants.map((g) => ({ roleId: role.id, ...g })),
      skipDuplicates: true,
    });
  }

  const navCount = await db.qtRoleNavigation.count({ where: { roleId: role.id } });
  if (navCount === 0) {
    await db.qtRoleNavigation.createMany({
      // Only seed nav-only keys (home / dashboards / plans). Entity-mapped
      // navs (spaces / timesheet / reports) are derived from view grants and
      // do NOT live in QtRoleNavigation anymore.
      data: NAV_KEYS.filter((k) => !(k in NAV_TO_ENTITY)).map((k) => ({
        roleId: role.id,
        navKey: k,
      })),
      skipDuplicates: true,
    });
  }

  return role.id;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ legacy backfill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

async function backfillLegacyResources(orgId: string): Promise<void> {
  const appId = await getQuikTrackAppId();
  if (!appId) return;

  const legacyKeys = Object.keys(LEGACY_RESOURCE_BACKFILL);
  if (legacyKeys.length === 0) return;

  const legacyRows = await db.qtRolePermission.findMany({
    where: {
      resource: { in: legacyKeys },
      role: { orgId, appId },
    },
    select: { id: true, roleId: true, resource: true, action: true },
  });
  if (legacyRows.length === 0) return;

  await db.$transaction(async (tx) => {
    for (const row of legacyRows) {
      if (!row.roleId) continue; // ignore project-role rows
      const newResources = LEGACY_RESOURCE_BACKFILL[row.resource] ?? [];
      for (const newRes of newResources) {
        await tx.qtRolePermission.upsert({
          where: {
            roleId_resource_action: {
              roleId: row.roleId,
              resource: newRes,
              action: row.action,
            },
          },
          create: { roleId: row.roleId, resource: newRes, action: row.action },
          update: {},
        });
      }
    }
    await tx.qtRolePermission.deleteMany({
      where: { id: { in: legacyRows.map((r) => r.id) } },
    });
  });
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ user â†’ role assignment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export async function ensureUserOnRole(
  userId: string,
  orgId: string,
  roleId: string,
  assignedBy?: string,
): Promise<void> {
  const existing = await db.qtUserAppRole.findFirst({
    where: { userId, orgId, roleId },
    select: { id: true },
  });
  if (existing) return;
  await db.qtUserAppRole.create({
    data: { userId, orgId, roleId, assignedBy: assignedBy ?? null },
  });
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ orchestrator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const seededOrgs = new Map<string, number>();
const SEED_CACHE_TTL_MS = 5 * 60 * 1000;

export async function seedAllDefaultRoles(
  orgId: string,
): Promise<{ adminRoleId: string; userRoleId: string }> {
  const cached = seededOrgs.get(orgId);
  const now = Date.now();
  const appId = await getQuikTrackAppId();
  if (cached && now - cached < SEED_CACHE_TTL_MS && appId) {
    const [admin, user] = await Promise.all([
      db.qtAppRole.findFirst({ where: { orgId, appId, name: "admin" }, select: { id: true } }),
      db.qtAppRole.findFirst({
        where: { orgId, appId, OR: [{ isDefault: true, isSystem: false }, { name: { in: ["Member", "User"] } }] },
        select: { id: true },
      }),
    ]);
    if (admin && user) return { adminRoleId: admin.id, userRoleId: user.id };
  }

  const [adminRoleId, userRoleId] = await Promise.all([
    seedAdminAppRole(orgId),
    seedUserAppRole(orgId),
  ]);
  await backfillLegacyResources(orgId);

  seededOrgs.set(orgId, now);
  return { adminRoleId, userRoleId };
}
