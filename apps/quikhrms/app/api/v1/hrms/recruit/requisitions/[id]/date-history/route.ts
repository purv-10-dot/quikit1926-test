import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

interface DateChange { from: string | null; to: string | null }

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    // Update-action logs for this requisition — filtered down to ones that
    // actually touched closedDate/targetJoiningDate (see the PATCH route,
    // which only ever logs here for date revisions today, but this stays
    // correct even if other Update logging is added for the entity later).
    const logs = await prisma.hrmsAuditLog.findMany({
      where: { orgId, entityType: "Requisition", entityId: params.id, action: "Update" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const dateLogs = logs.filter((l) => {
      const c = l.changes as unknown as Record<string, DateChange> | null;
      return !!c && ("closedDate" in c || "targetJoiningDate" in c);
    });
    if (dateLogs.length === 0) return successResponse([]);

    const userIds = [...new Set(dateLogs.map((l) => l.userId))];
    const employees = await prisma.employee.findMany({
      where: { id: { in: userIds }, orgId },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));

    const entries = dateLogs.map((l) => {
      const c = l.changes as unknown as Record<string, DateChange>;
      const meta = l.metadata as { reason?: string } | null;
      return {
        id: l.id,
        by: nameById.get(l.userId) ?? "Unknown",
        at: l.createdAt,
        startDateFrom: c.closedDate?.from ?? null,
        startDateTo: c.closedDate?.to ?? null,
        endDateFrom: c.targetJoiningDate?.from ?? null,
        endDateTo: c.targetJoiningDate?.to ?? null,
        reason: meta?.reason ?? null,
      };
    });

    return successResponse(entries);
  } catch (error) {
    console.error("GET /recruit/requisitions/:id/date-history error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.read"] });
