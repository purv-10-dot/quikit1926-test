/**
 * Auto-seed the admin AppRole for an org when QuikScale access is first
 * granted. Idempotent — safe to call repeatedly.
 *
 * Call this anywhere a user is granted QuikScale access (via
 * `quikit.UserAppAccess`). Effects:
 *
 *   1. Ensure `app_quikscale.AppRole` has a row for (orgId, QuikScale app,
 *      name="admin", isSystem=true). Creates it if missing.
 *   2. Ensure every (RESOURCE × ACTION) row exists in `RolePermission` for
 *      the admin role. The admin role is intended to be all-access; this
 *      mirrors that into the grid so the Manage Permission UI renders ✓ on
 *      every cell.
 *   3. Ensure every NAV_KEY row exists in `RoleNavigation` for the admin
 *      role. Same reason — the sidebar shows every link.
 *   4. Optionally link the granted user to the admin role via
 *      `app_quikscale.UserAppRole` so the Manage Permission UI's "Members"
 *      tab + the userCan() lookup find them.
 *
 * Returns the admin AppRole.id.
 */
import { db } from "@/lib/db";
import { RESOURCES, ACTIONS, NAV_KEYS } from "@quikit/shared";
import { getQuikScaleAppId } from "@/lib/api/permissions";

export async function seedAdminAppRole(orgId: string): Promise<string> {
  const appId = await getQuikScaleAppId();
  if (!appId) throw new Error("QuikScale App not registered in quikit.App");

  // 1. Admin AppRole — one per (org, app)
  const existing = await db.appRole.findFirst({
    where: { orgId, appId, name: "admin" },
    select: { id: true },
  });
  const role =
    existing ??
    (await db.appRole.create({
      data: {
        orgId,
        appId,
        name: "admin",
        description:
          "Full access — auto-seeded when the org is first granted QuikScale.",
        isSystem: true,
        isDefault: false,
      },
      select: { id: true },
    }));

  // 2. RolePermission — every RESOURCE × every ACTION
  const existingPerms = new Set(
    (
      await db.rolePermission.findMany({
        where: { roleId: role.id },
        select: { resource: true, action: true },
      })
    ).map((p) => `${p.resource}|${p.action}`),
  );
  for (const r of RESOURCES) {
    for (const a of ACTIONS) {
      if (existingPerms.has(`${r}|${a}`)) continue;
      await db.rolePermission.create({
        data: { roleId: role.id, resource: r, action: a },
      });
    }
  }

  // 3. RoleNavigation — every NAV_KEY
  const existingNav = new Set(
    (
      await db.roleNavigation.findMany({
        where: { roleId: role.id },
        select: { navKey: true },
      })
    ).map((n) => n.navKey),
  );
  for (const k of NAV_KEYS) {
    if (existingNav.has(k)) continue;
    await db.roleNavigation.create({
      data: { roleId: role.id, navKey: k },
    });
  }

  return role.id;
}

/**
 * Assign a user to a role via `app_quikscale.UserAppRole`. Idempotent.
 * Use this together with `seedAdminAppRole` whenever QuikScale access is
 * granted to a user.
 */
export async function ensureUserOnRole(
  userId: string,
  orgId: string,
  roleId: string,
  assignedBy?: string,
): Promise<void> {
  const existing = await db.userAppRole.findFirst({
    where: { userId, orgId, roleId },
    select: { id: true },
  });
  if (existing) return;
  await db.userAppRole.create({
    data: { userId, orgId, roleId, assignedBy: assignedBy ?? null },
  });
}
