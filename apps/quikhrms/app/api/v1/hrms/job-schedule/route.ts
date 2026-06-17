import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

const createEntrySchema = z.object({
  employeeId: z.string().optional(),
  date: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  hours: z.number().min(0).max(24),
  jobId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  note: z.string().optional(),
});

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId") ?? userId;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where = {
      orgId, employeeId, deletedAt: null,
      ...(from || to ? {
        date: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      } : {}),
    };

    const [entries, pendingCount] = await Promise.all([
      prisma.jobScheduleEntry.findMany({ where, orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
      prisma.jobScheduleEntry.count({ where: { ...where, status: "ScheduleDraft" } }),
    ]);

    return successResponse({ entries, pendingCount });
  } catch (error) {
    console.error("GET /job-schedule error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createEntrySchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const d = parsed.data;
    const entry = await prisma.jobScheduleEntry.create({
      data: {
        orgId, employeeId: d.employeeId ?? userId,
        date: new Date(d.date),
        startTime: d.startTime, endTime: d.endTime,
        hours: d.hours,
        jobId: d.jobId ?? null, projectId: d.projectId ?? null,
        note: d.note, status: "ScheduleDraft",
        createdBy: userId, updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "JobScheduleEntry", entityId: entry.id });
    return successResponse(entry, undefined, 201);
  } catch (error) {
    console.error("POST /job-schedule error:", error);
    return internalError();
  }
});
