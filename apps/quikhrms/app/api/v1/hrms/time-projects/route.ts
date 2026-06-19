import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";
import type { Prisma } from "@quikit/database";

const createProjectSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional().nullable(),
  description: z.string().optional(),
  clientName: z.string().optional(),
  departmentId: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  budgetHours: z.number().min(0).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  isBillable: z.boolean().default(false),
  status: z.enum(["ProjectActive", "ProjectOnHold", "ProjectCompleted", "ProjectArchived"]).default("ProjectActive"),
  memberIds: z.array(z.string()).optional(),
});

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const departmentId = searchParams.get("departmentId");
    const status = searchParams.get("status");

    const where: Prisma.TimeProjectWhereInput = {
      orgId, deletedAt: null,
      ...(departmentId && { departmentId }),
      ...(status && { status: status as Prisma.EnumProjectStatusFilter["equals"] }),
    };

    const [items, total] = await Promise.all([
      prisma.timeProject.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        include: { _count: { select: { jobs: { where: { deletedAt: null } } } } },
      }),
      prisma.timeProject.count({ where }),
    ]);

    return successResponse(items, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /time-projects error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    if (parsed.data.code) {
      const dup = await prisma.timeProject.findFirst({
        where: { orgId, code: parsed.data.code, deletedAt: null },
      });
      if (dup) return conflict("Project code already exists");
    }

    const d = parsed.data;
    const project = await prisma.timeProject.create({
      data: {
        orgId,
        name: d.name, code: d.code ?? null, description: d.description,
        clientName: d.clientName, departmentId: d.departmentId ?? null, ownerId: d.ownerId ?? null,
        budgetHours: d.budgetHours ?? null,
        startDate: d.startDate ? new Date(d.startDate) : null,
        endDate: d.endDate ? new Date(d.endDate) : null,
        isBillable: d.isBillable, status: d.status,
        memberIds: d.memberIds ?? undefined,
        createdBy: userId, updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "TimeProject", entityId: project.id });
    return successResponse(project, undefined, 201);
  } catch (error) {
    console.error("POST /time-projects error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.attendance.manage"] });
