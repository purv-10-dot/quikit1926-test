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
  LEGACY_NAV_TO_VIEW,
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
  if (navCount === 0 && NAV_KEYS.length > 0) {
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
 * surfaces (Issue, Sprint).
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
          "Default team-member role. View everywhere; edit on Issue / Sprint.",
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
    // Only Issue + Sprint have an `update` grant. Comment/timesheet edits are
    // author/owner-only (ownership checks, not grants), so they're not seeded.
    for (const resource of ["Issue", "Sprint"]) {
      grants.push({ resource, action: "update" });
    }
    await db.qtRolePermission.createMany({
      data: grants.map((g) => ({ roleId: role.id, ...g })),
      skipDuplicates: true,
    });
  }

  const navCount = await db.qtRoleNavigation.count({ where: { roleId: role.id } });
  if (navCount === 0 && NAV_KEYS.length > 0) {
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Space Creator role â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/** Display name of the seeded space-creator role. Single source of truth so
 *  the seeder, the orchestrator's cache check, and any future reference agree.
 *  Renamable by admins in the Roles UI — the seeder re-finds it by `isDefault`
 *  is N/A here, so a rename means the seeder would re-create it; if you rename,
 *  update this constant too (or set `isSystem: true` to lock the name). */
export const SPACE_CREATOR_ROLE_NAME = "Space Creator";

/**
 * "Space Creator" role: a Member who can ALSO create their own spaces.
 *
 * Grants = the default Member baseline (view everywhere; edit on
 * Issue / Comment / Timesheet / Sprint) PLUS `Project:create`. That single
 * extra grant is the whole point of the role.
 *
 * Visibility is unchanged from Member: the /api/projects list stays
 * membership-filtered for non-admins, so a Space Creator sees only the spaces
 * they belong to — including ones they create, where POST /api/projects
 * auto-assigns them the Layer-2 "Space Admin" role. It is NOT a system role
 * and NOT app-admin, so it never gains org-wide space visibility.
 *
 * `isSystem: false` / `isDefault: false` — admins can rename / retune / delete
 * it like any custom role, and new invitees do NOT auto-land here.
 */
export async function seedSpaceCreatorAppRole(orgId: string): Promise<string> {
  const appId = await getQuikTrackAppId();
  if (!appId) throw new Error("QuikTrack App not registered in quikit.App");

  const existing = await db.qtAppRole.findFirst({
    where: { orgId, appId, name: SPACE_CREATOR_ROLE_NAME },
    select: { id: true },
  });

  const role =
    existing ??
    (await db.qtAppRole.create({
      data: {
        orgId,
        appId,
        name: SPACE_CREATOR_ROLE_NAME,
        description:
          "Can create and run their own spaces. Same baseline as Member, plus space creation. Sees only spaces they belong to.",
        isSystem: false,
        isDefault: false,
      },
      select: { id: true },
    }));

  const grantCount = await db.qtRolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0) {
    const grants: Array<{ resource: string; action: string }> = [];
    // Member baseline: view everywhere…
    for (const leaf of walkLeaves()) {
      if ((leaf.actions as readonly string[]).includes("view")) {
        grants.push({ resource: leaf.resource, action: "view" });
      }
    }
    // …edit on the day-to-day work surfaces…
    // Only Issue + Sprint have an `update` grant. Comment/timesheet edits are
    // author/owner-only (ownership checks, not grants), so they're not seeded.
    for (const resource of ["Issue", "Sprint"]) {
      grants.push({ resource, action: "update" });
    }
    // …PLUS the one grant that defines this role: create new spaces.
    grants.push({ resource: "Project", action: "create" });

    await db.qtRolePermission.createMany({
      data: grants.map((g) => ({ roleId: role.id, ...g })),
      skipDuplicates: true,
    });
  }

  const navCount = await db.qtRoleNavigation.count({ where: { roleId: role.id } });
  if (navCount === 0 && NAV_KEYS.length > 0) {
    await db.qtRoleNavigation.createMany({
      // Only seed nav-only keys (home / dashboards). Entity-mapped navs
      // (spaces / timesheet / reports) are derived from view grants.
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

/**
 * One-time migration: the `home` / `dashboards` sidebar rows used to be stored
 * as explicit `QtRoleNavigation` rows. They're now derived from `Home:view` /
 * `Dashboard:view` entity grants (see LEGACY_NAV_TO_VIEW). For every app-wide
 * role that still has a legacy nav row, grant the mapped view permission so the
 * sidebar row survives, then drop the orphaned nav row. Idempotent.
 */
async function backfillNavToView(orgId: string): Promise<void> {
  const appId = await getQuikTrackAppId();
  if (!appId) return;

  const legacyNavKeys = Object.keys(LEGACY_NAV_TO_VIEW);
  if (legacyNavKeys.length === 0) return;

  const navRows = await db.qtRoleNavigation.findMany({
    where: {
      navKey: { in: legacyNavKeys },
      role: { orgId, appId },
    },
    select: { id: true, roleId: true, navKey: true },
  });
  if (navRows.length === 0) return;

  await db.$transaction(async (tx) => {
    for (const row of navRows) {
      if (!row.roleId) continue;
      const resource = LEGACY_NAV_TO_VIEW[row.navKey];
      if (!resource) continue;
      await tx.qtRolePermission.upsert({
        where: {
          roleId_resource_action: {
            roleId: row.roleId,
            resource,
            action: "view",
          },
        },
        create: { roleId: row.roleId, resource, action: "view" },
        update: {},
      });
    }
    await tx.qtRoleNavigation.deleteMany({
      where: { id: { in: navRows.map((r) => r.id) } },
    });
  });
}

/**
 * One-time migration: the grouped-kanban tab used to ride on `Board:view`. It
 * now has its own view-only `GroupedKanban` resource (group management itself
 * needs no permission — any project member can do it). To preserve tab access
 * for roles created before the split, copy every `Board:view` grant to a
 * `GroupedKanban:view` grant — app-wide AND project roles. Idempotent
 * (skipDuplicates); `Board` rows are left intact (Board still gates its own tab).
 */
async function backfillGroupedKanban(orgId: string): Promise<void> {
  const appId = await getQuikTrackAppId();
  if (!appId) return;

  const [appBoardRows, projBoardRows] = await Promise.all([
    db.qtRolePermission.findMany({
      where: { resource: "Board", action: "view", role: { orgId, appId } },
      select: { roleId: true },
    }),
    db.qtProjectRolePermission.findMany({
      where: { resource: "Board", action: "view", projectRole: { orgId } },
      select: { projectRoleId: true },
    }),
  ]);

  const appData = appBoardRows
    .filter((r): r is { roleId: string } => !!r.roleId)
    .map((r) => ({ roleId: r.roleId, resource: "GroupedKanban", action: "view" }));
  const projData = projBoardRows.map((r) => ({
    projectRoleId: r.projectRoleId,
    resource: "GroupedKanban",
    action: "view",
  }));

  await Promise.all([
    appData.length
      ? db.qtRolePermission.createMany({ data: appData, skipDuplicates: true })
      : Promise.resolve(null),
    projData.length
      ? db.qtProjectRolePermission.createMany({ data: projData, skipDuplicates: true })
      : Promise.resolve(null),
  ]);
}

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
): Promise<{ adminRoleId: string; userRoleId: string; spaceCreatorRoleId: string }> {
  const cached = seededOrgs.get(orgId);
  const now = Date.now();
  const appId = await getQuikTrackAppId();
  if (cached && now - cached < SEED_CACHE_TTL_MS && appId) {
    const [admin, user, spaceCreator] = await Promise.all([
      db.qtAppRole.findFirst({ where: { orgId, appId, name: "admin" }, select: { id: true } }),
      db.qtAppRole.findFirst({
        where: { orgId, appId, OR: [{ isDefault: true, isSystem: false }, { name: { in: ["Member", "User"] } }] },
        select: { id: true },
      }),
      db.qtAppRole.findFirst({
        where: { orgId, appId, name: SPACE_CREATOR_ROLE_NAME },
        select: { id: true },
      }),
    ]);
    // Trust the cache only when ALL seeded roles already exist. A missing role
    // (e.g. Space Creator on an org seeded before this role was introduced)
    // forces the full re-seed below, so existing tenants backfill on next load
    // instead of waiting out the TTL.
    if (admin && user && spaceCreator) {
      return {
        adminRoleId: admin.id,
        userRoleId: user.id,
        spaceCreatorRoleId: spaceCreator.id,
      };
    }
  }

  const [adminRoleId, userRoleId, spaceCreatorRoleId] = await Promise.all([
    seedAdminAppRole(orgId),
    seedUserAppRole(orgId),
    seedSpaceCreatorAppRole(orgId),
  ]);
  await backfillLegacyResources(orgId);
  await backfillNavToView(orgId);
  await backfillGroupedKanban(orgId);

  seededOrgs.set(orgId, now);
  return { adminRoleId, userRoleId, spaceCreatorRoleId };
}
