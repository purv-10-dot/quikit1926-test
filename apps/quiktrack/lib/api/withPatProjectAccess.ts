import { NextRequest, NextResponse } from "next/server";
import { withPatAuth, type PatAuthContext, type WithPatAuthOptions } from "@/lib/api/withPatAuth";
import { loadProjectAccess, type LoadedProjectAccess } from "@/lib/api/withProjectAccess";
import { userCanInProject } from "@/lib/api/permissions";
import type { Action, Resource } from "@/lib/api/permissionsRegistry";

export interface PatProjectAuthContext extends PatAuthContext, LoadedProjectAccess {}

interface Options extends WithPatAuthOptions {
  requirePermission?: { resource: Resource; action: Action };
}

/**
 * Composes withPatAuth with the same project-membership/permission
 * resolution withProjectAccess uses (loadProjectAccess, userCanInProject) —
 * it does not reimplement that logic in a second path.
 */
export function withPatProjectAccess<Params = Record<string, never>>(
  handler: (
    ctx: PatProjectAuthContext,
    req: NextRequest,
    routeCtx: { params: Params },
  ) => Promise<NextResponse> | NextResponse,
  options: Options = {},
) {
  return withPatAuth<Params>(async (patCtx, req, routeCtx) => {
    const access = await loadProjectAccess(patCtx.orgId, patCtx.userId, patCtx.projectId);
    if (!access) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    if (!access.isTenantAdmin && options.requirePermission) {
      const { resource, action } = options.requirePermission;
      const allowed = await userCanInProject(patCtx.userId, patCtx.orgId, patCtx.projectId, resource, action);
      if (!allowed) {
        return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
      }
    }

    return handler({ ...patCtx, ...access }, req, routeCtx);
  }, options);
}
