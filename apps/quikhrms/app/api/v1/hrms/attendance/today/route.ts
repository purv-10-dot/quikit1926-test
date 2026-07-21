import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { attendanceDayStart } from "@/lib/attendance/day";

export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const today = attendanceDayStart();

    const employeeId = (await resolveEmployeeId(orgId, userId)) ?? userId;

    const [record, shiftAssign, rosterEntry] = await Promise.all([
      prisma.attendanceRecord.findFirst({
        where: { orgId, employeeId, date: today, deletedAt: null },
      }),
      prisma.shiftAssignment.findFirst({
        where: {
          orgId, employeeId, deletedAt: null,
          effectiveFrom: { lte: today },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        },
        include: { shift: true },
        orderBy: { effectiveFrom: "desc" },
      }),
      prisma.rosterEntry.findFirst({
        where: {
          orgId, employeeId, date: today, deletedAt: null,
          roster: { status: "Published", deletedAt: null },
        },
        include: { shift: true },
      }),
    ]);

    // A published roster's shift for today wins over the standing assignment.
    const shift = rosterEntry?.type === "Duty" && rosterEntry.shift
      ? { name: rosterEntry.shift.name, start: rosterEntry.shift.startTime, end: rosterEntry.shift.endTime }
      : shiftAssign?.shift
        ? { name: shiftAssign.shift.name, start: shiftAssign.shift.startTime, end: shiftAssign.shift.endTime }
        : { name: "General", start: "09:00", end: "18:00" };

    type Punch = { in: string; out: string | null };
    const punches: Punch[] = Array.isArray(record?.punches) ? (record!.punches as Punch[]) : [];
    const openPunch = punches.find((p) => !p.out);
    const checkedIn = !!openPunch;

    const now = Date.now();
    const totalSeconds = punches.reduce((sum, p) => {
      const start = new Date(p.in).getTime();
      const end = p.out ? new Date(p.out).getTime() : now;
      return sum + Math.max(0, Math.floor((end - start) / 1000));
    }, 0);

    return successResponse({
      record,
      shift,
      checkedIn,
      elapsedSeconds: totalSeconds,
      punches,
    });
  } catch (error) {
    console.error("GET /attendance/today error:", error);
    return internalError();
  }
});
