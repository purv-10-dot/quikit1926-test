import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withServiceAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const [epf, esi, pt, lwf, bonus] = await Promise.all([
      prisma.ePFConfig.findUnique({ where: { orgId }, select: { enabled: true, epfNumber: true } }),
      prisma.eSIConfig.findUnique({ where: { orgId }, select: { enabled: true } }),
      prisma.professionalTaxConfig.count({ where: { orgId } }),
      prisma.lWFConfig.count({ where: { orgId } }),
      prisma.statutoryBonusConfig.findUnique({ where: { orgId }, select: { enabled: true } }),
    ]);

    return successResponse({
      epf: !!(epf?.enabled && epf?.epfNumber),
      esi: !!esi?.enabled,
      pt: pt > 0,
      lwf: lwf > 0,
      bonus: !!bonus?.enabled,
    });
  } catch (e) {
    console.error("GET /payroll/statutory/status error:", e);
    return internalError();
  }
});
