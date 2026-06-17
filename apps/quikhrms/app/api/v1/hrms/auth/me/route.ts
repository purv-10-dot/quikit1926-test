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

  return successResponse({
    user: employee,
    roles: ctx.roles,
    roleCode: ctx.roleCode,
    permissions: ctx.permissions,
    mustChangePassword: employee?.mustChangePassword ?? false,
    // Employee is still in PreBoarding — UI uses this to collapse the sidebar
    // to just the onboarding tasks until HR confirms employment.
    preBoarding: employee?.status === "PreBoarding",
  });
});
