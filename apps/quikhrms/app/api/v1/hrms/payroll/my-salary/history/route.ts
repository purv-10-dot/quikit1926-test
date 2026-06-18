import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";

export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const history = await prisma.employeeSalary.findMany({
      where: { orgId, employeeId, deletedAt: null },
      include: { structure: { select: { id: true, name: true, code: true } } },
      orderBy: { effectiveFrom: "desc" },
    });

    const rows = history.map((h, idx, arr) => {
      const prev = arr[idx + 1];
      const ctc = Number(h.ctc);
      const prevCtc = prev ? Number(prev.ctc) : null;
      const delta = prevCtc != null ? ctc - prevCtc : null;
      const pct = prevCtc != null && prevCtc > 0 ? (delta! / prevCtc) * 100 : null;
      return {
        id: h.id,
        ctc,
        currency: h.currency,
        effectiveFrom: h.effectiveFrom,
        effectiveTo: h.effectiveTo,
        revisionReason: h.revisionReason,
        isActive: h.isActive,
        structure: h.structure,
        deltaAmount: delta,
        deltaPercent: pct,
      };
    });

    return successResponse(rows);
  } catch (e) {
    console.error("GET /payroll/my-salary/history error:", e);
    return internalError();
  }
});
