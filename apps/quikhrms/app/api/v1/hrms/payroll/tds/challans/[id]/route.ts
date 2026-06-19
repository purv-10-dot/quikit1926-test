import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { refreshLiabilityForChallan } from "@/lib/services/tds-liability";

export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const challan = await prisma.tdsChallan.findFirst({
      where: { id, orgId, deletedAt: null },
      include: {
        allocations: {
          include: {
            period: { select: { id: true, periodYear: true, periodMonth: true, natureOfPayment: true, totalDeducted: true, status: true } },
          },
        },
      },
    });
    if (!challan) return notFound("Challan not found");
    return successResponse(challan);
  } catch (e) {
    console.error("GET /payroll/tds/challans/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.tdsChallan.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Challan not found");

    // Capture touched periods BEFORE delete, so we can refresh after.
    const touchedPeriodIds = (await prisma.tdsChallanAllocation.findMany({
      where: { challanId: id },
      select: { period: { select: { periodYear: true, periodMonth: true, natureOfPayment: true } } },
    })).map((a) => a.period);

    await prisma.tdsChallan.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Allocations have onDelete: Cascade so they're already gone — but we soft-
    // delete the challan, so allocations physically remain. Wipe them explicitly
    // to free up the periods' allocated totals.
    await prisma.tdsChallanAllocation.deleteMany({ where: { challanId: id } });

    // Refresh each affected period
    const { refreshLiabilityForPeriod } = await import("@/lib/services/tds-liability");
    for (const p of touchedPeriodIds) {
      await refreshLiabilityForPeriod(orgId, p.periodYear, p.periodMonth, p.natureOfPayment);
    }
    // Also re-derive challan-side status (it's now soft-deleted, but in case)
    await refreshLiabilityForChallan(orgId, id);

    await createAuditLog({
      orgId, userId, action: "Delete",
      entityType: "TdsChallan", entityId: id,
      metadata: { cin: existing.cin },
    });

    return successResponse({ id, deleted: true });
  } catch (e) {
    console.error("DELETE /payroll/tds/challans/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
