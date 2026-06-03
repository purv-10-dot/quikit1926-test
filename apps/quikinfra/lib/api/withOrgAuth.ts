import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";
import { toErrorMessage } from "@/lib/api/errors";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { logApiCall } from "@quikit/shared/apiLogging";
import { userCan } from "@/lib/rbac/userCan";

/**
 * withOrgAuth — lifted from apps/quikscale and scoped to `quikinfra`.
 *
 * Provides: session check → orgId resolution → optional module feature gate
 * → optional RBAC v2 permission gate → try/catch with friendly 500 →
 * fire-and-forget API call log.
 *
 * Use the curried `withOrgAuthForModule("masters")` at the top of each
 * route file so FF-1 gating inherits through every handler in the file,
 * or `withOrgAuthForResource("construction.boq")` for per-verb RBAC gating.
 */
export interface TenantAuthContext {
  session: Session;
  userId: string;
  orgId: string;
}

export interface WithTenantAuthOptions {
  fallbackErrorMessage?: string;
  moduleKey?: string;
  /**
   * RBAC v2 permission gate. When set, runs userCan(userId, orgId, resource, action)
   * after the module gate. If the user lacks the permission, returns 403.
   */
  permission?: { resource: string; action: string };
  /**
   * "Any-of" RBAC v2 gate. When set, the user passes if they hold AT LEAST
   * ONE of the listed (resource, action) permissions. Used where one action
   * implies another — e.g. BOQ "import" (upload revision) is allowed for
   * anyone who can already edit/create BOQ.
   */
  permissionAnyOf?: Array<{ resource: string; action: string }>;
}

export function withOrgAuth<Params = Record<string, never>>(
  handler: (
    ctx: TenantAuthContext,
    req: NextRequest,
    routeCtx: { params: Params },
  ) => Promise<NextResponse> | NextResponse,
  options: WithTenantAuthOptions = {},
) {
  return async (req: NextRequest, routeCtx: { params: Params }): Promise<NextResponse> => {
    const startedAt = Date.now();
    let orgIdForLog: string | null = null;
    let userIdForLog: string | null = null;
    let response: NextResponse;
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        response = NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      } else {
        userIdForLog = session.user.id;
        const orgId = await getTenantId(session.user.id);
        if (!orgId) {
          response = NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
        } else {
          orgIdForLog = orgId;
          let blocked: NextResponse | null = null;
          if (options.moduleKey) {
            const ff = await gateModuleApi("quikinfra", options.moduleKey, orgId);
            if (ff) blocked = ff as NextResponse;
          }
          // RBAC v2 permission gate — runs AFTER module gate so a disabled
          // module 404s before we even ask whether the user has rights.
          if (!blocked && options.permission) {
            const allowed = await userCan(
              session.user.id,
              orgId,
              options.permission.resource,
              options.permission.action,
            );
            if (!allowed) {
              blocked = NextResponse.json(
                { success: false, error: "Forbidden" },
                { status: 403 },
              );
            }
          }
          // Any-of gate — pass if the user holds at least one listed permission.
          if (!blocked && options.permissionAnyOf?.length) {
            const checks = await Promise.all(
              options.permissionAnyOf.map((p) =>
                userCan(session.user.id, orgId, p.resource, p.action),
              ),
            );
            if (!checks.some(Boolean)) {
              blocked = NextResponse.json(
                { success: false, error: "Forbidden" },
                { status: 403 },
              );
            }
          }
          if (blocked) {
            response = blocked;
          } else {
            response = await handler(
              { session, userId: session.user.id, orgId },
              req,
              routeCtx ?? ({ params: {} as Params }),
            );
          }
        }
      }
    } catch (error: unknown) {
      response = NextResponse.json(
        { success: false, error: toErrorMessage(error, options.fallbackErrorMessage ?? "Operation failed") },
        { status: 500 },
      );
    }

    void logApiCall({
      orgId: orgIdForLog,
      userId: userIdForLog,
      appSlug: "quikinfra",
      method: req.method,
      path: req.nextUrl.pathname,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
    });

    return response;
  };
}

export function withOrgAuthForModule(moduleKey: string) {
  return <Params = Record<string, never>>(
    handler: Parameters<typeof withOrgAuth<Params>>[0],
    options: WithTenantAuthOptions = {},
  ) => withOrgAuth<Params>(handler, { moduleKey, ...options });
}

/** Standard 403 helper for callers that gate via userCan() inside the handler. */
export function forbidden(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Forbidden" },
    { status: 403 },
  );
}

/**
 * Per-resource curry factory. Hard-codes the RBAC v2 action so route files
 * don't repeat it per handler:
 *
 *   const auth = withOrgAuthForResource("construction.boq");
 *   export const GET    = auth.view(async ({ orgId }) => { ... });
 *   export const POST   = auth.create(async ({ orgId }) => { ... });
 *   export const PATCH  = auth.edit(async ({ orgId }) => { ... });
 *   export const DELETE = auth.delete(async ({ orgId }) => { ... });
 */
export function withOrgAuthForResource(resource: string) {
  const wrap = (action: string) =>
    <Params = Record<string, never>>(
      handler: Parameters<typeof withOrgAuth<Params>>[0],
      options: WithTenantAuthOptions = {},
    ) =>
      withOrgAuth<Params>(handler, {
        permission: { resource, action },
        ...options,
      });
  // "Upload a revision" is functionally editing the dataset, so allow it for
  // anyone who can import OR edit OR create the resource — not just the
  // narrow `import` permission (which the per-user matrix can't even grant).
  const importOrEdit = <Params = Record<string, never>>(
    handler: Parameters<typeof withOrgAuth<Params>>[0],
    options: WithTenantAuthOptions = {},
  ) =>
    withOrgAuth<Params>(handler, {
      permissionAnyOf: [
        { resource, action: "import" },
        { resource, action: "edit" },
        { resource, action: "create" },
      ],
      ...options,
    });

  return {
    view: wrap("view"),
    create: wrap("create"),
    edit: wrap("edit"),
    delete: wrap("delete"),
    approve: wrap("approve"),
    import: wrap("import"),
    importOrEdit,
    export: wrap("export"),
    lock: wrap("lock"),
    manage: wrap("manage"),
  };
}
