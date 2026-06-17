import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { resolveEffectiveWfhQuotaGroup } from "@/lib/services/wfh-quota";

export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const effective = await resolveEffectiveWfhQuotaGroup(orgId, employeeId);
    if (!effective.group) {
      return successResponse({ hasQuota: false, group: null, source: null, yearlyQuota: null, used: 0, remaining: null });
    }

    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const rows = await prisma.wfhRequest.findMany({
      where: {
        orgId, employeeId, deletedAt: null,
        status: { in: ["Pending", "Approved"] },
        startDate: { gte: yearStart, lt: yearEnd },
      },
      select: { days: true, status: true },
    });
    const used = rows.reduce((sum, r) => sum + Number(r.days), 0);
    const quota = effective.group.yearlyQuota;
    return successResponse({
      hasQuota: true,
      group: { id: effective.group.id, name: effective.group.name },
      source: effective.source,
      yearlyQuota: quota,
      used,
      remaining: Math.max(0, quota - used),
      year,
    });
  } catch (e) {
    console.error("GET /wfh/quota/me", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.read"], anyPermission: true });
