import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";

/**
 * GET /api/v1/hrms/payroll/runs/:id/release-preflight
 * Returns counts + a sample list of employees on this run who would NOT receive
 * a payslip email at release (missing workEmail). UI surfaces this so HR can fix
 * profiles before clicking Release.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const { id } = params as { id: string };

    const run = await prisma.payRun.findFirst({
      where: { id, orgId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!run) return notFound("Pay run not found");

    const payslips = await prisma.payslip.findMany({
      where: { payRunId: id, orgId, deletedAt: null },
      select: { id: true, employeeId: true },
    });

    const employeeIds = payslips.map((p) => p.employeeId);
    if (employeeIds.length === 0) {
      return successResponse({ totalPayslips: 0, missingEmail: [], missingEmailCount: 0 });
    }

    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds }, orgId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, workEmail: true },
    });
    const employeeById = new Map(employees.map((e) => [e.id, e]));

    const missingEmail = payslips
      .map((p) => employeeById.get(p.employeeId))
      .filter((e): e is NonNullable<typeof e> => !!e && !e.workEmail)
      .map((e) => ({
        employeeId: e.id,
        employeeCode: e.employeeCode,
        name: `${e.firstName} ${e.lastName}`.trim(),
      }));

    return successResponse({
      totalPayslips: payslips.length,
      missingEmailCount: missingEmail.length,
      missingEmail,
    });
  } catch (e) {
    console.error("GET /payroll/runs/[id]/release-preflight error:", e);
    return internalError();
  }
});
