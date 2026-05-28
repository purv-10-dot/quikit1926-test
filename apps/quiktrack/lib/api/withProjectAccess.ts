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

export interface LoadedProjectAccess {
  projectId: string;
  projectRole: ProjectRole | null;
  isTenantAdmin: boolean;
}

/**
 * Imperative variant of {@link withProjectAccess}. Used by routes that need
 * to look up a project from a non-project-id route param (e.g.
 * `/api/groups/[id]` resolves the project from the group row) or that need
 * conditional access logic the HOF doesn't express.
 *
 * Returns `null` when the caller is in the tenant but not a member of the
 * project (mirrors withProjectAccess's 404-leak-avoidance behaviour — the
 * caller decides what status code to return).
 */
export async function loadProjectAccess(
  orgId: string,
  userId: string,
  projectId: string,
): Promise<LoadedProjectAccess | null> {
  const project = await db.qtProject.findFirst({
    where: { id: projectId, orgId, isDeleted: false },
    select: { id: true },
  });
  if (!project) return null;

  const tenantAdmin = await isTenantAdmin(userId, orgId);
  if (tenantAdmin) {
    return { projectId, projectRole: null, isTenantAdmin: true };
  }

  const member = await db.qtProjectMember.findFirst({
    where: { projectId, userId, isDeleted: false },
    select: { role: true },
  });
  if (!member) return null;

  return {
    projectId,
    projectRole: (member.role as ProjectRole) ?? null,
    isTenantAdmin: false,
  };
}

/**
 * Permission gate for write operations on task groups (create/rename/recolor/
 * delete/reorder/move-task). Tenant admins and project admins/members may
 * write; VIEWER may not.
 */
export function canWriteGroups(access: LoadedProjectAccess): boolean {
  if (access.isTenantAdmin) return true;
  return access.projectRole === "PROJECT_ADMIN" || access.projectRole === "MEMBER";
}
