/**
 * Scoped query helpers — enforce tenant/org isolation on all DB queries.
 *
 * Pattern matches QuikScale's lib/security/scopedQuery.ts
 */

import { getServerSession } from "next-auth";

export interface SecurityContext {
  userId: string;
  tenantId: string;
  organizationId: string;
  role: string;
  projectIds?: string[]; // For site-scoped users
}

/**
 * Resolve security context from the current session.
 * Returns null if not authenticated.
 */
export async function resolveContext(): Promise<SecurityContext | null> {
  const session = await getServerSession();
  if (!session?.user) return null;

  const user = session.user as any;
  return {
    userId: user.id,
    tenantId: user.tenantId,
    organizationId: user.organizationId,
    role: user.role ?? "user",
    projectIds: user.projectIds,
  };
}

/**
 * Create a Prisma where clause scoped to the user's tenant/org.
 * Optionally filter by assigned projects for site-scoped roles.
 */
export function createScopedQuery(
  ctx: SecurityContext,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    tenantId: ctx.tenantId,
    orgId: ctx.organizationId,
    ...extra,
  };

  // Site-scoped users only see their assigned projects
  if (
    ctx.projectIds &&
    ctx.projectIds.length > 0 &&
    (ctx.role === "site_admin" || ctx.role === "user")
  ) {
    where.projectId = { in: ctx.projectIds };
  }

  return where;
}

/**
 * Strip client-sent scope fields and apply server context.
 * Prevents cross-tenant data injection.
 */
export function assertScopedPayload(
  ctx: SecurityContext,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const { tenantId, orgId, organizationId, ...rest } = payload as any;
  return {
    ...rest,
    tenantId: ctx.tenantId,
    orgId: ctx.organizationId,
  };
}
