import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { allPermissionPairs, SPACE_ADMIN_ROLE_NAME } from "@/lib/api/permissionsRegistry";

// GET /api/me/project-permissions?projectId=<id>
// Returns the caller's effective permissions inside a single project, using the
// SAME resolution as `userCanInProject`: the project (custom) role OVERRIDES the
// app-wide (global) role.
//   • Holds a project role here  → that role's grants ∪ per-user extras.
//                                   (app-wide grants are NOT mixed in)
//   • No project role here       → fall back to app-wide grants ∪ extras.
// App-admins are short-circuited client-side (this endpoint isn't called for
// them); server enforcement still bypasses admins in userCanInProject().
//
// Shape mirrors /api/me/permissions: `permissions: string[]` of "resource:action".
export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json(
      { success: false, error: "projectId required" },
      { status: 400 },
    );
  }

  // Tenant guard — project must belong to caller's org.
  const project = await db.qtProject.findFirst({
    where: { id: projectId, orgId, isDeleted: false },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json(
      { success: false, error: "Project not found" },
      { status: 404 },
    );
  }

  // The project role assigned to this user here (≤1 — unique on [projectId, userId]).
  const assignment = await db.qtProjectUserRole.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { projectRoleId: true, projectRole: { select: { name: true } } },
  });

  // Space Admin = full access within its space (mirrors userCanInProject). Return
  // every valid pair so the client treats the holder as full-access.
  if (assignment?.projectRole.name === SPACE_ADMIN_ROLE_NAME) {
    return NextResponse.json({
      success: true,
      data: {
        projectId,
        permissions: allPermissionPairs().map((p) => `${p.resource}:${p.action}`),
      },
    });
  }

  const [grants, extras] = await Promise.all([
    assignment
      ? // Authoritative: project role grants only — app-wide is NOT mixed in.
        db.qtProjectRolePermission.findMany({
          where: { projectRoleId: assignment.projectRoleId },
          select: { resource: true, action: true },
        })
      : // No project role here → fall back to the app-wide role.
        db.qtRolePermission.findMany({
          where: { role: { members: { some: { userId, orgId } } } },
          select: { resource: true, action: true },
        }),
    db.qtUserPermissionExtra.findMany({
      where: { userId, orgId },
      select: { resource: true, action: true },
    }),
  ]);

  const set = new Set<string>();
  for (const g of grants) set.add(`${g.resource}:${g.action}`);
  for (const g of extras) set.add(`${g.resource}:${g.action}`);

  return NextResponse.json({
    success: true,
    data: { projectId, permissions: Array.from(set) },
  });
});
