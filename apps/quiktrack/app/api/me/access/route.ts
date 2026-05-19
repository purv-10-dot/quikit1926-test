import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getQuikTrackAppId, isAdminRole } from "@/lib/api/permissions";

// GET /api/me/access
// Powers the dashboard's NoAccessGate. Returns enough context to render
// a friendly "you don't have project access" wall:
//   - isOrgAdmin / isAppAdmin / isAdmin (any of these → pass through)
//   - hasProjects / projectCount
//   - orgName + roleName (display chip)
//   - adminEmails (up to 3) — so the user can "request access" via mailto
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  const [membership, org, appId, projectCount] = await Promise.all([
    db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { role: true },
    }),
    db.org.findUnique({ where: { id: orgId }, select: { name: true } }),
    getQuikTrackAppId(),
    db.qtProjectMember.count({
      where: {
        userId,
        isDeleted: false,
        project: { orgId, isDeleted: false },
      },
    }),
  ]);

  const isOrgAdmin =
    membership?.role === "admin" || membership?.role === "owner";

  let isAppAdmin = false;
  let roleName: string | null = null;
  const adminEmails: string[] = [];

  if (appId) {
    // App-role assignment (for both this user + admins to ping)
    const [myAssignments, adminAssignments] = await Promise.all([
      db.qtUserAppRole.findMany({
        where: { userId, orgId, role: { appId } },
        select: { role: { select: { isSystem: true, name: true } } },
      }),
      db.qtUserAppRole.findMany({
        where: { orgId, role: { appId, isSystem: true, name: "admin" } },
        select: { user: { select: { email: true } } },
        take: 5,
      }),
    ]);

    isAppAdmin = myAssignments.some((ur) => isAdminRole(ur.role));
    roleName = myAssignments[0]?.role.name ?? null;
    for (const a of adminAssignments) {
      if (a.user?.email && a.user.email !== "" && adminEmails.length < 3) {
        adminEmails.push(a.user.email);
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      isOrgAdmin,
      isAppAdmin,
      isAdmin: isOrgAdmin || isAppAdmin,
      hasProjects: projectCount > 0,
      projectCount,
      orgName: org?.name ?? null,
      roleName,
      adminEmails,
    },
  });
});
