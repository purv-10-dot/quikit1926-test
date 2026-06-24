/**
 * Row-level data visibility helpers.
 *
 * Used by list endpoints (GET) to scope what each user is allowed to see:
 *   - Admins see every row in the org.
 *   - Non-admins see only rows they own (or, for team KPIs, rows under teams
 *     they belong to).
 *
 * The v2 RBAC `view` permission (in `permissionsRegistry.ts`) is module-level
 * — it controls whether the user can open the page at all. This file adds
 * the row-level filter on top.
 */

import { db } from "@/lib/db";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";
import { getQuikScaleAppId } from "@/lib/api/permissions";

/**
 * Returns true when the caller should see every row in the org for this app.
 *
 * Admin precedence:
 *   1. `auth.User.isSuperAdmin = true`
 *   2. Legacy `OrgMember.role` ≥ ADMIN per ROLE_HIERARCHY
 *   3. Has a QuikScale v2 admin AppRole (`isSystem=true && name="admin"`)
 *
 * Any one of the three is sufficient. Called once per request — small DB hit,
 * not cached. If this ever becomes hot, wrap with a per-request memo.
 */
export async function isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  // 1. Super admin short-circuit
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  if (u?.isSuperAdmin) return true;

  // 2. Legacy OrgMember.role
  const m = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { role: true },
  });
  if (m && (ROLE_HIERARCHY[m.role] ?? 0) >= ROLE_HIERARCHY[ROLES.ADMIN]) {
    return true;
  }

  // 3. RBAC v2 admin AppRole for QuikScale
  const appId = await getQuikScaleAppId();
  if (!appId) return false;
  const v2Admin = await db.userAppRole.findFirst({
    where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
    select: { id: true },
  });
  return !!v2Admin;
}

/**
 * Returns every team id the user has access to in this org. Includes both
 * direct membership (UserTeam join) and team headship (Team.headId === userId).
 *
 * Used by the Team KPI list to scope rows. Non-admin members see only KPIs
 * under teams they belong to (whether as a member or as the team head).
 */
export async function getMyTeamIds(userId: string, orgId: string): Promise<string[]> {
  const [memberRows, headedRows] = await Promise.all([
    db.qsUserTeam.findMany({
      where: { userId, orgId },
      select: { teamId: true },
    }),
    db.qsTeam.findMany({
      where: { orgId, headId: userId },
      select: { id: true },
    }),
  ]);
  const ids = new Set<string>();
  for (const r of memberRows) ids.add(r.teamId);
  for (const t of headedRows) ids.add(t.id);
  return Array.from(ids);
}
