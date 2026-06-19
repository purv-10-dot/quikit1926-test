import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";
import type { Prisma } from "@quikit/database";

const createJobSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  code: z.string().optional().nullable(),
  description: z.string().optional(),
  assigneeId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  estimatedHours: z.number().min(0).optional().nullable(),
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  isBillable: z.boolean().default(false),
  status: z.enum(["JobActive", "JobCompleted", "JobCancelled"]).default("JobActive"),
});

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const projectId = searchParams.get("projectId");
    const assigneeId = searchParams.get("assigneeId");
    const departmentId = searchParams.get("departmentId");
    const status = searchParams.get("status");

    const where: Prisma.TimeJobWhereInput = {
      orgId, deletedAt: null,
      ...(projectId && { projectId }),
      ...(assigneeId && { assigneeId }),
      ...(departmentId && { departmentId }),
      ...(status && { status: status as Prisma.EnumJobStatusFilter["equals"] }),
    };

    const [items, total] = await Promise.all([
      prisma.timeJob.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        include: { project: { select: { id: true, name: true } } },
      }),
      prisma.timeJob.count({ where }),
    ]);

    return successResponse(items, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /time-jobs error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createJobSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const d = parsed.data;
    const job = await prisma.timeJob.create({
      data: {
        orgId, projectId: d.projectId,
        name: d.name, code: d.code ?? null, description: d.description,
        assigneeId: d.assigneeId ?? null, departmentId: d.departmentId ?? null,
        estimatedHours: d.estimatedHours ?? null,
        startDate: d.startDate ? new Date(d.startDate) : null,
        dueDate: d.dueDate ? new Date(d.dueDate) : null,
        isBillable: d.isBillable, status: d.status,
        createdBy: userId, updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "TimeJob", entityId: job.id });
    return successResponse(job, undefined, 201);
  } catch (error) {
    console.error("POST /time-jobs error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.attendance.manage"] });
