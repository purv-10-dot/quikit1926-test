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
    const idOrKey = routeCtx.params?.[paramKey] as string | undefined;
    if (!idOrKey) {
      return NextResponse.json(
        { success: false, error: "Project id missing" },
        { status: 400 },
      );
    }

    // The route param may be either the project's cuid OR its human-readable
    // projectKey (e.g. "WST") — readable URLs like /spaces/WST/backlog. Resolve
    // to the real id once, org-scoped (keys are unique per org), then use that
    // cuid for every downstream check so nothing else has to know about keys.
    const project = await db.qtProject.findFirst({
      where: {
        orgId: tenantCtx.orgId,
        isDeleted: false,
        OR: [{ id: idOrKey }, { projectKey: idOrKey }],
      },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }
    const projectId = project.id;

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
          return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
        }
      }

      // Legacy enum gate (deprecated) — for routes not yet migrated.
      if (options.requireRoles && (!projectRole || !options.requireRoles.includes(projectRole))) {
        return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
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
  idOrKey: string,
): Promise<LoadedProjectAccess | null> {
  // Accept cuid OR projectKey (see withProjectAccess) and resolve to the id.
  const project = await db.qtProject.findFirst({
    where: {
      orgId,
      isDeleted: false,
      OR: [{ id: idOrKey }, { projectKey: idOrKey }],
    },
    select: { id: true },
  });
  if (!project) return null;
  const projectId = project.id;

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
 * True if the user is still an active member of the org. This is the
 * live-access recheck for a user-scoped PAT (withPatAuth.ts) — unlike a
 * legacy project-scoped PAT, it isn't bound to any one project to recheck
 * membership against, so the closest equivalent signal is org membership.
 */
export async function isActiveOrgMember(orgId: string, userId: string): Promise<boolean> {
  const member = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  return Boolean(member);
}

export interface AccessibleProject {
  id: string;
  projectKey: string;
  name: string;
}

/**
 * Every project a user can act on in this org — same admin-bypass-else-
 * membership branching as `loadProjectAccess`/`app/api/projects/route.ts`'s
 * space list. Backs the `list_projects` MCP tool, which a user-scoped PAT
 * needs to discover valid project ids (a legacy project-scoped PAT has no
 * use for this beyond its own single project).
 */
export async function loadAccessibleProjects(
  orgId: string,
  userId: string,
): Promise<AccessibleProject[]> {
  const fullAccess =
    (await isTenantAdmin(userId, orgId)) || (await isQuikTrackAppAdmin(userId, orgId));

  return db.qtProject.findMany({
    where: {
      orgId,
      isDeleted: false,
      ...(fullAccess ? {} : { members: { some: { userId, isDeleted: false } } }),
    },
    select: { id: true, projectKey: true, name: true },
  });
}

/**
 * Write gate for task-group operations (create/rename/recolor/delete/reorder/
 * move-task). Reorganizing the board's grouping is a project write, so it's
 * gated on `Issue:update` — the same grant that lets a role move/edit work.
 * Contributor and Space Admin hold it; a read-only Viewer does not, so a Viewer
 * (who is still a project member) can browse the grouped board but not mutate
 * its groups. Global admins short-circuit via `isTenantAdmin`.
 */
export async function canWriteGroups(
  access: LoadedProjectAccess,
  userId: string,
  orgId: string,
): Promise<boolean> {
  if (access.isTenantAdmin) return true;
  return userCanInProject(userId, orgId, access.projectId, "Issue", "update");
}
