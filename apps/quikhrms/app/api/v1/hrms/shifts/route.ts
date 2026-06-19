import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createShiftPolicySchema } from "@/lib/validations/shift";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const where = { orgId, deletedAt: null };

    const [shifts, total] = await Promise.all([
      prisma.shiftPolicy.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { assignments: { where: { deletedAt: null } } } } },
      }),
      prisma.shiftPolicy.count({ where }),
    ]);

    return successResponse(shifts, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /shifts error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createShiftPolicySchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;

    const existing = await prisma.shiftPolicy.findFirst({
      where: { orgId, code: data.code, deletedAt: null },
    });
    if (existing) return conflict("Shift code already exists");

    const shift = await prisma.shiftPolicy.create({
      data: {
        orgId,
        name: data.name,
        code: data.code,
        color: data.color,
        startTime: data.startTime,
        endTime: data.endTime,
        breakDuration: data.breakDuration,
        breakStartTime: data.breakStartTime,
        breakEndTime: data.breakEndTime,
        graceMinutes: data.graceMinutes,
        minHoursRequired: data.minHoursRequired,
        isFlexible: data.isFlexible,
        flexibleWindowStart: data.flexibleWindowStart,
        flexibleWindowEnd: data.flexibleWindowEnd,
        isNightShift: data.isNightShift,
        weekOffs: data.weekOffs ? JSON.parse(JSON.stringify(data.weekOffs)) : undefined,
        effectiveFrom: new Date(data.effectiveFrom),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : undefined,
        isDefault: data.isDefault,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return successResponse(shift, undefined, 201);
  } catch (error) {
    console.error("POST /shifts error:", error);
    return internalError();
  }
});
