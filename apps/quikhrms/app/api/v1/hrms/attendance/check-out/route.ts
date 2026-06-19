import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { checkOutSchema } from "@/lib/validations/attendance";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { fireWorkflow } from "@/lib/workflows/executor";

type Punch = { in: string; out: string | null };

/** POST /api/v1/hrms/attendance/check-out */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = checkOutSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return validationError("Employee record not found");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await prisma.attendanceRecord.findFirst({
      where: { orgId, employeeId, date: today, deletedAt: null },
    });

    if (!record) return notFound("No check-in found for today");

    const punches: Punch[] = Array.isArray(record.punches) ? (record.punches as Punch[]) : [];
    const openIdx = punches.findIndex((p) => !p.out);
    if (openIdx === -1) return notFound("No active check-in to check out from");

    const now = new Date();
    punches[openIdx] = { ...punches[openIdx], out: now.toISOString() };

    // Sum closed-punch durations (ms)
    const totalMs = punches.reduce((sum, p) => {
      if (!p.out) return sum;
      return sum + (new Date(p.out).getTime() - new Date(p.in).getTime());
    }, 0);
    const grossHours = totalMs / (1000 * 60 * 60);
    const breakHours = Number(record.breakDuration ?? 0);
    const effectiveHours = Math.max(0, grossHours - breakHours);

    const data = parsed.data;

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOut: now,
        punches: punches as object,
        grossHours: Math.round(grossHours * 100) / 100,
        effectiveHours: Math.round(effectiveHours * 100) / 100,
        checkOutLocation: data.location ? JSON.parse(JSON.stringify(data.location)) : undefined,
        remarks: data.remarks ?? record.remarks,
        updatedBy: userId,
      },
    });

    void fireWorkflow({
      orgId, event: "attendance.checked_out",
      payload: { employeeId, recordId: updated.id, checkOutAt: now, effectiveHours: Math.round(effectiveHours * 100) / 100 },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("POST /attendance/check-out error:", error);
    return internalError();
  }
});
