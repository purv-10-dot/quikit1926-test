import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, spaceAdminProjectIds } from "@/lib/api/permissions";

/**
 * Users who hold a "Space Admin" project role across the projects the caller
 * can access. Powers the role-scoped user filter on the Reports pages
 * (Project / Resource / Executive). Project roles are per-project, so the same
 * person may hold the role in several projects — we return each user once.
 *
 * Legacy names ("Project Admin" / "PM") are kept in the match list so spaces
 * not yet migrated to the merged role still surface their managers.
 */
const ROLE_NAMES = ["Space Admin", "Project Admin", "PM"];

export const GET = withOrgAuth(async ({ orgId, userId }, _req) => {
  // Admins see all org projects; non-admins only the projects they Space Admin.
  const isAdmin = await hasAdminAccess(userId, orgId);
  let projectIds: string[] | null = null;
  if (!isAdmin) {
    projectIds = await spaceAdminProjectIds(userId, orgId);
    if (projectIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }
  }

  const roleAssignments = await db.qtProjectUserRole.findMany({
    where: {
      projectRole: { orgId, name: { in: ROLE_NAMES, mode: "insensitive" } },
      ...(projectIds ? { projectId: { in: projectIds } } : {}),
    },
    select: { userId: true },
  });

  const distinctUserIds = Array.from(new Set(roleAssignments.map((r) => r.userId)));
  if (distinctUserIds.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const users = await db.user.findMany({
    where: { id: { in: distinctUserIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const data = users
    .map((u) => ({
      id: u.id,
      name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ success: true, data });
});
