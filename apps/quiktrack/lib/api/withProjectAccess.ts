import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth, type OrgAuthContext } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { isQuikTrackAppAdmin, userCanInProject } from "@/lib/api/permissions";
import type { Action, Resource } from "@/lib/api/permissionsRegistry";

/**
 * Authorization hierarchy (single source of truth):
 *
 *   1. Tenant admin  (OrgMember.role = admin/owner)   → full access everywhere
 *   2. App admin      (QtAppRole "admin")             → full access everywhere
 *   3. Everyone else                                  → custom project-role
 *      permissions via `userCanInProject` (the project-role matrix).
 *
 *   if (isTenantAdmin || isQuikTrackAppAdmin) allow();
 *   else evaluateProjectPermissionsUsingCustomRoles();
 *
 * The legacy `qtProjectMember.role` enum (PROJECT_ADMIN/MEMBER/VIEWER) is NO
 * LONGER an authorization source — use `requirePermission` (below) instead of
 * `requireRoles`. The enum is retained on the row for display + the creator
 * seed only. `requireRoles` is kept temporarily for backward compatibility.
 */

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
  /**
   * Preferred gate: the (resource, action) the caller must hold via their
   * custom project role (checked with `userCanInProject`). Global admins
   * bypass it. This is the authoritative permission model.
   */
  requirePermission?: { resource: Resource; action: Action };
  /** @deprecated Legacy enum gate — use `requirePermission`. Kept for BC. */
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

    // Global admin override: tenant admin OR app admin → full access. Skips
    // membership + every project-level permission check.
    const orgAdmin = await isTenantAdmin(tenantCtx.userId, tenantCtx.orgId);
    const fullAccess =
      orgAdmin || (await isQuikTrackAppAdmin(tenantCtx.userId, tenantCtx.orgId));

    let projectRole: ProjectRole | null = null;
    if (!fullAccess) {
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

      // Preferred: permission-based gate via the custom project role.
      if (options.requirePermission) {
        const { resource, action } = options.requirePermission;
        if (
          !(await userCanInProject(
            tenantCtx.userId,
            tenantCtx.orgId,
            projectId,
            resource,
            action,
          ))
        ) {
          return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        }
      }

      // Legacy enum gate (deprecated) — for routes not yet migrated.
      if (options.requireRoles && (!projectRole || !options.requireRoles.includes(projectRole))) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
    }

    return handler(
      { ...tenantCtx, projectId, projectRole, isTenantAdmin: fullAccess },
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

  const fullAccess =
    (await isTenantAdmin(userId, orgId)) || (await isQuikTrackAppAdmin(userId, orgId));
  if (fullAccess) {
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
 * Write gate for task-group operations (create/rename/recolor/delete/reorder/
 * move-task). Group management is open to any project member — the caller has
 * already verified membership via `loadProjectAccess` (non-members get 404), so
 * there is no additional permission to check.
 */
export async function canWriteGroups(
  _access: LoadedProjectAccess,
  _userId: string,
  _orgId: string,
): Promise<boolean> {
  return true;
}
