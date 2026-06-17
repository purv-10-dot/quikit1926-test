import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";

export const DELETE = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const existing = await prisma.stateMinimumWage.findFirst({
      where: { id: params.id, orgId },
    });
    if (!existing) return notFound("State minimum wage entry not found");
    await prisma.stateMinimumWage.delete({ where: { id: params.id } });
    return successResponse({ deleted: true });
  } catch (e) {
    console.error("DELETE /payroll/state-min-wage/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
