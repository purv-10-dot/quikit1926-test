import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createTimesheetSchema } from "@/lib/validations/gap-fill";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const employeeId = searchParams.get("employeeId") ?? userId;
    const status = searchParams.get("status");

    const where: Prisma.TimesheetWhereInput = {
      orgId, employeeId, deletedAt: null,
      ...(status && { status: status as Prisma.EnumTimesheetStatusFilter["equals"] }),
    };

    const [sheets, total] = await Promise.all([
      prisma.timesheet.findMany({
        where, orderBy: { periodStart: "desc" }, skip: (page - 1) * limit, take: limit,
        include: { _count: { select: { logs: true } } },
      }),
      prisma.timesheet.count({ where }),
    ]);

    return successResponse(sheets, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /timesheets error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createTimesheetSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const periodStart = new Date(parsed.data.periodStart);
    const periodEnd = new Date(parsed.data.periodEnd);

    const existing = await prisma.timesheet.findFirst({
      where: { orgId, employeeId: userId, periodStart, periodEnd, deletedAt: null },
    });
    if (existing) return conflict("Timesheet already exists for this period");

    const logs = parsed.data.logIds && parsed.data.logIds.length > 0
      ? await prisma.timeLog.findMany({
          where: { id: { in: parsed.data.logIds }, orgId, employeeId: userId, timesheetId: null, deletedAt: null },
        })
      : [];

    const totalHours = logs.reduce((s, l) => s + Number(l.duration), 0);
    const billableHours = logs.filter((l) => l.isBillable).reduce((s, l) => s + Number(l.duration), 0);

    const timesheet = await prisma.timesheet.create({
      data: {
        orgId,
        employeeId: userId,
        periodType: parsed.data.periodType,
        periodStart, periodEnd,
        totalHours, billableHours,
        notes: parsed.data.notes,
        status: "TsDraft",
        createdBy: userId, updatedBy: userId,
      },
    });

    if (logs.length > 0) {
      await prisma.timeLog.updateMany({
        where: { id: { in: logs.map((l) => l.id) } },
        data: { timesheetId: timesheet.id },
      });
    }

    await createAuditLog({ orgId, userId, action: "Create", entityType: "Timesheet", entityId: timesheet.id });
    return successResponse(timesheet, undefined, 201);
  } catch (error) {
    console.error("POST /timesheets error:", error);
    return internalError();
  }
});
