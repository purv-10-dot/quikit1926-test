import type { NextRequest, NextResponse } from "next/server";
import type { HdUser } from "@prisma/client";
import { withOrgAuth, type OrgAuthContext, type WithOrgAuthOptions } from "@/lib/api/withOrgAuth";
import { resolveUser } from "@/lib/helpdesk-context";
import { handleApiError } from "@/lib/api";

/**
 * Helpdesk API guard = canonical `withOrgAuth` + the resolved `HdUser`.
 *
 * `withOrgAuth` establishes the platform contract (session → { userId, orgId },
 * membership + app-access re-validation, 401/403). On top of that this wrapper
 * resolves the helpdesk's own domain user (`HdUser`, keyed by
 * external_id = session user id) so handlers keep doing role checks
 * (`requireRole`, `isAgentOrAbove`, …) exactly as before.
 *
 * Domain errors thrown inside the handler (AuthError, ZodError) are funnelled
 * through `handleApiError`, so route bodies stay free of try/catch boilerplate.
 *
 * Usage:
 *   export const GET = withHelpdeskAuth(async ({ orgId, user }, req) => {
 *     const data = await prisma.ticket.findMany({ where: { tenant_id: orgId } });
 *     return successResponse(data);
 *   });
 */
export interface HelpdeskAuthContext extends OrgAuthContext {
  /** The helpdesk domain user (HdUser) — carries the in-app `role`. */
  user: HdUser;
  /** Alias for orgId — the helpdesk scopes rows by `tenant_id`. */
  tenantId: string;
}

export function withHelpdeskAuth<Params = Record<string, never>>(
  handler: (
    ctx: HelpdeskAuthContext,
    req: NextRequest,
    routeCtx: { params: Params },
  ) => Promise<Response> | Response,
  options: WithOrgAuthOptions = {},
) {
  return withOrgAuth<Params>(async (orgCtx, req, routeCtx) => {
    try {
      const user = await resolveUser(orgCtx.orgId, orgCtx.userId);
      const res = await handler({ ...orgCtx, user, tenantId: orgCtx.orgId }, req, routeCtx);
      return res as NextResponse;
    } catch (err) {
      return handleApiError(err) as NextResponse;
    }
  }, options);
}
