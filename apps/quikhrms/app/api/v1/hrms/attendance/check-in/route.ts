import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { checkInSchema } from "@/lib/validations/attendance";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { fireWorkflow } from "@/lib/workflows/executor";
import { attendanceDayStart } from "@/lib/attendance/day";

type Punch = { in: string; out: string | null };

/** POST /api/v1/hrms/attendance/check-in */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = checkInSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return validationError("Employee record not found");

    const today = attendanceDayStart();

    const existing = await prisma.attendanceRecord.findFirst({
      where: { orgId, employeeId, date: today, deletedAt: null },
    });

    const now = new Date();
    const data = parsed.data;
    const punches: Punch[] = Array.isArray(existing?.punches) ? (existing.punches as Punch[]) : [];

    if (punches.some((p) => !p.out)) {
      return conflict("Already checked in. Please check out first.");
    }

    const newPunches: Punch[] = [...punches, { in: now.toISOString(), out: null }];

    if (existing) {
      const record = await prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          checkIn: existing.checkIn ?? now,
          checkOut: null,
          punches: newPunches as object,
          status: "Present",
          source: data.source,
          checkInLocation: data.location ? JSON.parse(JSON.stringify(data.location)) : undefined,
          ipAddress: data.ipAddress,
          remarks: data.remarks ?? existing.remarks,
          updatedBy: userId,
        },
      });
      void fireWorkflow({
        orgId, event: "attendance.checked_in",
        payload: { employeeId, recordId: record.id, checkInAt: now },
      });
      return successResponse(record);
    }

    const record = await prisma.attendanceRecord.create({
      data: {
        orgId,
        employeeId,
        date: today,
        checkIn: now,
        punches: newPunches as object,
        status: "Present",
        source: data.source,
        checkInLocation: data.location ? JSON.parse(JSON.stringify(data.location)) : undefined,
        ipAddress: data.ipAddress,
        remarks: data.remarks,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    void fireWorkflow({
      orgId, event: "attendance.checked_in",
      payload: { employeeId, recordId: record.id, checkInAt: now },
    });

    return successResponse(record, undefined, 201);
  } catch (error) {
    console.error("POST /attendance/check-in error:", error);
    return internalError();
  }
});
