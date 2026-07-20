import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { successResponse } from "@/lib/api-response";
import type { AuthContext } from "@/lib/types/api";

export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const employee = await prisma.employee.findFirst({
    where: { id: ctx.userId, orgId: ctx.orgId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, workEmail: true, profilePhoto: true, jobTitle: true, mustChangePassword: true, status: true },
  });

  // When the user is acting under a delegation, resolve the delegators' names so
  // the UI can show a clear "acting on behalf of …" banner.
  const delegatedFrom = ctx.delegatedFrom ?? [];
  let actingFor: { delegatorId: string; name: string; permissions: string[] }[] = [];
  if (delegatedFrom.length) {
    const delegators = await prisma.employee.findMany({
      where: { orgId: ctx.orgId, id: { in: delegatedFrom.map((d) => d.delegatorId) }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(delegators.map((d) => [d.id, `${d.firstName} ${d.lastName}`.trim()]));
    actingFor = delegatedFrom.map((d) => ({
      delegatorId: d.delegatorId,
      name: nameById.get(d.delegatorId) ?? "a colleague",
      permissions: d.permissions,
    }));
  }

  return successResponse({
    user: employee,
    roles: ctx.roles,
    roleCode: ctx.roleCode,
    permissions: ctx.permissions,
    mustChangePassword: employee?.mustChangePassword ?? false,
    // Employee is still in PreBoarding — UI uses this to collapse the sidebar
    // to just the onboarding tasks until HR confirms employment.
    preBoarding: employee?.status === "PreBoarding",
    // Non-empty only while the user is standing in for someone via delegation.
    actingFor,
  });
});
