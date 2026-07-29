import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createAppraisalCycleSchema } from "@/lib/validations/performance";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const where: Record<string, unknown> = { orgId, deletedAt: null };
    if (status) where.status = status;
    if (type) where.type = type;

    const [cycles, total] = await Promise.all([
      prisma.appraisalCycle.findMany({
        where, orderBy: { startDate: "desc" }, skip: (page - 1) * limit, take: limit,
        include: { _count: { select: { appraisals: true } } },
      }),
      prisma.appraisalCycle.count({ where }),
    ]);
    return successResponse(cycles, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /appraisals/cycles error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.performance.appraise"] });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createAppraisalCycleSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const cycle = await prisma.appraisalCycle.create({
      data: {
        orgId, name: data.name, type: data.type,
        startDate: new Date(data.startDate), endDate: new Date(data.endDate),
        reviewFormId: data.reviewFormId,
        applicableTo: data.applicableTo ? JSON.parse(JSON.stringify(data.applicableTo)) : undefined,
        stages: data.stages ? JSON.parse(JSON.stringify(data.stages)) : undefined,
        createdBy: userId, updatedBy: userId,
      },
    });
    return successResponse(cycle, undefined, 201);
  } catch (error) { console.error("POST /appraisals/cycles error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.performance.appraise"] });
