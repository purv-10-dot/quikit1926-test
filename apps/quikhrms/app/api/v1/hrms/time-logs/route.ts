import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createTimeLogSchema } from "@/lib/validations/gap-fill";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { hoursBetween } from "@/lib/services/gap-fill";
import { createAuditLog } from "@/lib/utils/audit";
import { resolveEmployeeId } from "@/lib/resolve-employee";

type Punch = { in: string; out: string | null };

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    let employeeId = searchParams.get("employeeId") ?? userId;
    if (employeeId === "me" || employeeId === userId) {
      employeeId = (await resolveEmployeeId(orgId, userId)) ?? employeeId;
    }
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const dateRange = from || to ? {
      date: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    } : {};

    const where = { orgId, employeeId, deletedAt: null, ...dateRange };

    const [logs, total, attendance] = await Promise.all([
      prisma.timeLog.findMany({
        where, orderBy: [{ date: "desc" }, { startTime: "desc" }],
        skip: (page - 1) * limit, take: limit,
      }),
      prisma.timeLog.count({ where }),
      prisma.attendanceRecord.findMany({
        where: { orgId, employeeId, deletedAt: null, ...dateRange },
        select: { id: true, date: true, punches: true },
      }),
    ]);

    // Virtual time logs from attendance punches (read-only).
    const virtualLogs = attendance.flatMap((rec) => {
      const punches: Punch[] = Array.isArray(rec.punches) ? (rec.punches as Punch[]) : [];
      return punches
        .filter((p) => p.in && p.out)
        .map((p, idx) => {
          const start = new Date(p.in);
          const end = new Date(p.out!);
          const duration = Math.max(0, (end.getTime() - start.getTime()) / 3600000);
          return {
            id: `att:${rec.id}:${idx}`,
            orgId,
            employeeId,
            date: rec.date,
            startTime: start,
            endTime: end,
            duration: Math.round(duration * 100) / 100,
            projectId: null,
            taskId: null,
            description: "Attendance",
            isBillable: false,
            status: "LogAttendance",
            timesheetId: null,
            source: "attendance" as const,
          };
        });
    });

    const merged = [...logs.map((l) => ({ ...l, source: "manual" as const })), ...virtualLogs]
      .sort((a, b) => {
        const bd = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (bd !== 0) return bd;
        return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
      });

    return successResponse(merged, paginationMeta(page, limit, total + virtualLogs.length));
  } catch (error) {
    console.error("GET /time-logs error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createTimeLogSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return validationError("Employee record not found");

    const start = new Date(parsed.data.startTime);
    const end = parsed.data.endTime ? new Date(parsed.data.endTime) : null;
    const duration = parsed.data.duration || hoursBetween(start, end);

    const log = await prisma.timeLog.create({
      data: {
        orgId,
        employeeId,
        date: new Date(parsed.data.date),
        startTime: start,
        endTime: end,
        duration,
        projectId: parsed.data.projectId ?? null,
        taskId: parsed.data.taskId ?? null,
        description: parsed.data.description,
        isBillable: parsed.data.isBillable,
        status: "LogDraft",
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "TimeLog", entityId: log.id });
    return successResponse(log, undefined, 201);
  } catch (error) {
    console.error("POST /time-logs error:", error);
    return internalError();
  }
});
