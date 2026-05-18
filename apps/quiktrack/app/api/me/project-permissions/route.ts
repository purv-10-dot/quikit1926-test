import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

// GET /api/me/project-permissions?projectId=<id>
// Returns the caller's effective permissions inside a single project:
//   Layer 1 (app-wide app-role grants + per-user extras)
//   UNION Layer 2 (the project-role assigned to this user on this project)
//
// Shape mirrors /api/me/permissions: `permissions: string[]` of "resource:action"
// strings. Used by the client to hide mutation buttons for actions the user
// can't perform — server still enforces via userCanInProject().
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

  const [appRoleGrants, extras, projectGrants] = await Promise.all([
    db.qtRolePermission.findMany({
      where: { role: { members: { some: { userId, orgId } } } },
      select: { resource: true, action: true },
    }),
    db.qtUserPermissionExtra.findMany({
      where: { userId, orgId },
      select: { resource: true, action: true },
    }),
    db.qtProjectRolePermission.findMany({
      where: {
        projectRole: {
          projectId,
          members: { some: { userId } },
        },
      },
      select: { resource: true, action: true },
    }),
  ]);

  const set = new Set<string>();
  for (const g of appRoleGrants) set.add(`${g.resource}:${g.action}`);
  for (const g of extras) set.add(`${g.resource}:${g.action}`);
  for (const g of projectGrants) set.add(`${g.resource}:${g.action}`);

  return NextResponse.json({
    success: true,
    data: { projectId, permissions: Array.from(set) },
  });
});
