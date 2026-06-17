import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createLeaveTypeSchema } from "@/lib/validations/leave";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const where = { orgId, deletedAt: null };

    const [types, total] = await Promise.all([
      prisma.leaveType.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.leaveType.count({ where }),
    ]);

    return successResponse(types, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /leaves/types error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createLeaveTypeSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;

    // The unique constraint covers soft-deleted rows too, so a previously
    // deleted leave type with the same code blocks recreation. Check across
    // BOTH states up front: restore the soft-deleted one, conflict on a live
    // one. Without this, the DB unique trips and surfaces as 500.
    const existing = await prisma.leaveType.findFirst({
      where: { orgId, code: data.code },
    });
    if (existing) {
      if (existing.deletedAt) {
        const restored = await prisma.leaveType.update({
          where: { id: existing.id },
          data: {
            ...data,
            applicableEmploymentType: data.applicableEmploymentType
              ? JSON.parse(JSON.stringify(data.applicableEmploymentType)) : undefined,
            clubbingRestrictions: data.clubbingRestrictions
              ? JSON.parse(JSON.stringify(data.clubbingRestrictions)) : undefined,
            deletedAt: null,
            updatedBy: userId,
          },
        });
        return successResponse(restored, undefined, 200);
      }
      return conflict(`Leave type with code "${data.code}" already exists`);
    }

    try {
      const leaveType = await prisma.leaveType.create({
        data: {
          orgId,
          ...data,
          applicableEmploymentType: data.applicableEmploymentType
            ? JSON.parse(JSON.stringify(data.applicableEmploymentType)) : undefined,
          clubbingRestrictions: data.clubbingRestrictions
            ? JSON.parse(JSON.stringify(data.clubbingRestrictions)) : undefined,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      return successResponse(leaveType, undefined, 201);
    } catch (createErr) {
      // Safety net for any race where the pre-check missed.
      const err = createErr as { code?: string; meta?: { target?: string[] } };
      if (err.code === "P2002") {
        return conflict(`Leave type with code "${data.code}" already exists`);
      }
      throw createErr;
    }
  } catch (error) {
    console.error("POST /leaves/types error:", error);
    return internalError();
  }
});
