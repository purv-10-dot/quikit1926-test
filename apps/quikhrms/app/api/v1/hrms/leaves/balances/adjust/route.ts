import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { adjustLeaveBalanceSchema } from "@/lib/validations/leave";

/** POST /api/v1/hrms/leaves/balances/adjust — HR manual adjustment */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = adjustLeaveBalanceSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { employeeId, leaveTypeId, year, adjustment } = parsed.data;

    const existing = await prisma.leaveBalance.findFirst({
      where: { orgId, employeeId, leaveTypeId, year },
    });

    if (existing) {
      const updated = await prisma.leaveBalance.update({
        where: { id: existing.id },
        data: {
          adjusted: { increment: adjustment },
          updatedBy: userId,
        },
      });
      return successResponse(updated);
    }

    const created = await prisma.leaveBalance.create({
      data: {
        orgId,
        employeeId,
        leaveTypeId,
        year,
        adjusted: adjustment,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return successResponse(created, undefined, 201);
  } catch (error) {
    console.error("POST /leaves/balances/adjust error:", error);
    return internalError();
  }
});
