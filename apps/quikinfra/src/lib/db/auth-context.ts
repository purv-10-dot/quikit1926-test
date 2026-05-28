/**
 * Server-side auth context resolver for API routes.
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export interface AuthContext {
  userId: string;
  tenantId: string;
  orgId: string;
  role: string;
  email: string;
  projectIds?: string[];
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getServerSession();
  if (!session?.user) return null;

  const user = session.user as any;
  return {
    userId: user.id ?? "system",
    tenantId: user.tenantId ?? "default",
    orgId: user.organizationId ?? "default",
    role: user.role ?? "user",
    email: user.email ?? "",
    projectIds: user.projectIds,
  };
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden(msg = "Forbidden") {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export function notFound(msg = "Not found") {
  return NextResponse.json({ error: msg }, { status: 404 });
}

/**
 * Build scoped where clause for DB queries.
 */
export function scopedWhere(ctx: AuthContext, extra?: Record<string, unknown>) {
  const where: Record<string, unknown> = {
    tenantId: ctx.tenantId,
    orgId: ctx.orgId,
    ...extra,
  };
  if (ctx.projectIds?.length && (ctx.role === "site_admin" || ctx.role === "user")) {
    where.projectId = { in: ctx.projectIds };
  }
  return where;
}

/**
 * Inject tenant scope + audit fields into create payload.
 */
export function scopedCreate(ctx: AuthContext, data: Record<string, unknown>) {
  const { tenantId, orgId, ...rest } = data as any;
  return {
    ...rest,
    tenantId: ctx.tenantId,
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  };
}
