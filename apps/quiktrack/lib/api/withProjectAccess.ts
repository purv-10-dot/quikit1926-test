import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth, type OrgAuthContext } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

export type ProjectRole = "PROJECT_ADMIN" | "MEMBER" | "VIEWER";

export interface ProjectAuthContext extends OrgAuthContext {
  projectId: string;
  /** Role on this project. `null` when caller is tenant/super admin (full access). */
  projectRole: ProjectRole | null;
  isTenantAdmin: boolean;
}

interface Options {
  /** Default extracts `params.projectId`. Override for routes that nest under `[id]`. */
  paramKey?: "projectId" | "id";
  /** When set, only roles in the list (or admins) may invoke. */
  requireRoles?: ProjectRole[];
}

async function isTenantAdmin(userId: string, orgId: string): Promise<boolean> {
  const m = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  return m?.role === "admin" || m?.role === "owner";
}

/**
 * Wraps a route handler to enforce project membership on top of tenant auth.
 * Returns 404 (not 403) when the caller is in the tenant but not a member of
 * the project, so project existence is not leaked.
 */
export function withProjectAccess<Params extends Record<string, string>>(
  handler: (
    ctx: ProjectAuthContext,
    req: NextRequest,
    routeCtx: { params: Params },
  ) => Promise<NextResponse> | NextResponse,
  options: Options = {},
) {
  const paramKey = options.paramKey ?? "projectId";
  return withOrgAuth<Params>(async (tenantCtx, req, routeCtx) => {
    const projectId = routeCtx.params?.[paramKey] as string | undefined;
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Project id missing" },
        { status: 400 },
      );
    }

    const project = await db.qtProject.findFirst({
      where: { id: projectId, orgId: tenantCtx.orgId, isDeleted: false },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }

    const tenantAdmin = await isTenantAdmin(tenantCtx.userId, tenantCtx.orgId);

    let projectRole: ProjectRole | null = null;
    if (!tenantAdmin) {
      const member = await db.qtProjectMember.findFirst({
        where: { projectId, userId: tenantCtx.userId, isDeleted: false },
        select: { role: true },
      });
      if (!member) {
        return NextResponse.json(
          { success: false, error: "Project not found" },
          { status: 404 },
        );
      }
      projectRole = member.role as ProjectRole;
    }

    if (options.requireRoles && !tenantAdmin) {
      if (!projectRole || !options.requireRoles.includes(projectRole)) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }
    }

    return handler(
      { ...tenantCtx, projectId, projectRole, isTenantAdmin: tenantAdmin },
      req,
      routeCtx,
    );
  });
}
