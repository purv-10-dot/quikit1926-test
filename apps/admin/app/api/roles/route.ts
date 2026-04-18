import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { ROLES, ROLE_HIERARCHY, ROLE_LABELS } from "@/lib/constants";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: "Full access to all features including billing, user management, and org deletion",
  [ROLES.ADMIN]: "Manage users, teams, apps, and org settings. Cannot delete the organisation",
  [ROLES.EXECUTIVE]: "View all data across the organisation. Cannot manage users or settings",
  [ROLES.MANAGER]: "Manage their team's KPIs, priorities, and meetings. View team reports",
  [ROLES.EMPLOYEE]: "Access assigned apps, update their own KPIs and priorities",
  [ROLES.COACH]: "View-only access to assigned teams for coaching and mentoring purposes",
};

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  [ROLES.SUPER_ADMIN]: [
    "org.manage", "org.delete", "org.billing",
    "members.invite", "members.manage", "members.remove",
    "teams.create", "teams.manage", "teams.delete",
    "apps.manage", "roles.manage",
    "kpi.view_all", "kpi.manage",
    "priority.view_all", "priority.manage",
    "meetings.manage", "reports.view_all",
  ],
  [ROLES.ADMIN]: [
    "org.manage", "org.billing",
    "members.invite", "members.manage", "members.remove",
    "teams.create", "teams.manage", "teams.delete",
    "apps.manage", "roles.manage",
    "kpi.view_all", "kpi.manage",
    "priority.view_all", "priority.manage",
    "meetings.manage", "reports.view_all",
  ],
  [ROLES.EXECUTIVE]: [
    "kpi.view_all", "priority.view_all",
    "meetings.manage", "reports.view_all",
  ],
  [ROLES.MANAGER]: [
    "kpi.view_team", "kpi.manage",
    "priority.view_team", "priority.manage",
    "meetings.manage", "reports.view_team",
  ],
  [ROLES.EMPLOYEE]: [
    "kpi.view_own", "kpi.update_own",
    "priority.view_own", "priority.update_own",
    "meetings.view",
  ],
  [ROLES.COACH]: [
    "kpi.view_team", "priority.view_team",
    "meetings.view", "reports.view_team",
  ],
};

export const GET = withAdminAuth(async ({ tenantId }) => {
  const blocked = await gateModuleApi("admin", "roles", tenantId);
  if (blocked) return blocked as NextResponse;

  // Get member counts per role for this tenant
  const roleCounts = await db.membership.groupBy({
    by: ["role"],
    where: { tenantId, status: "active" },
    _count: { userId: true },
  });

  const countMap = new Map(roleCounts.map((r) => [r.role, r._count.userId]));

  const roles = Object.values(ROLES).map((role) => ({
    id: role,
    label: ROLE_LABELS[role] || role,
    description: ROLE_DESCRIPTIONS[role] || "",
    level: ROLE_HIERARCHY[role] || 0,
    permissions: DEFAULT_PERMISSIONS[role] || [],
    memberCount: countMap.get(role) || 0,
  }));

  // Sort by hierarchy level descending
  roles.sort((a, b) => b.level - a.level);

  return NextResponse.json({ success: true, data: roles });
});
