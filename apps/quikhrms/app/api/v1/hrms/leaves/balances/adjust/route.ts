import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, forbidden, internalError } from "@/lib/api-response";
import { adjustLeaveBalanceSchema } from "@/lib/validations/leave";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { createAuditLog } from "@/lib/utils/audit";

const MAX_ADJUSTMENT = 365; // sanity bound — no single manual adjustment beyond a year

/** POST /api/v1/hrms/leaves/balances/adjust — HR manual adjustment */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = adjustLeaveBalanceSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { employeeId, leaveTypeId, year, adjustment, reason } = parsed.data;

    // No self-adjustment — a manage-holder must not inflate their own balance.
    const meId = await resolveEmployeeId(orgId, userId);
    if (meId && meId === employeeId) {
      return forbidden("You can't adjust your own leave balance. Ask another administrator.");
    }

    // Bound the magnitude so a fat-finger / abuse can't grant an absurd balance.
    if (Math.abs(adjustment) > MAX_ADJUSTMENT) {
      return validationError(`Adjustment must be between -${MAX_ADJUSTMENT} and ${MAX_ADJUSTMENT} days.`);
    }

    const existing = await prisma.leaveBalance.findFirst({
      where: { orgId, employeeId, leaveTypeId, year },
    });

    const result = existing
      ? await prisma.leaveBalance.update({
          where: { id: existing.id },
          data: { adjusted: { increment: adjustment }, updatedBy: userId },
        })
      : await prisma.leaveBalance.create({
          data: { orgId, employeeId, leaveTypeId, year, adjusted: adjustment, createdBy: userId, updatedBy: userId },
        });

    // Audit every manual adjustment with the reason for accountability.
    await createAuditLog({
      orgId, userId, action: "Update", entityType: "LeaveBalance", entityId: result.id,
      metadata: { employeeId, leaveTypeId, year, adjustment, reason: reason ?? null },
    });

    return successResponse(result, undefined, existing ? 200 : 201);
  } catch (error) {
    console.error("POST /leaves/balances/adjust error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave.manage"] });
