import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createAttendancePolicySchema } from "@/lib/validations/attendance";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const where = { orgId, deletedAt: null };

    const [policies, total] = await Promise.all([
      prisma.attendancePolicy.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.attendancePolicy.count({ where }),
    ]);

    return successResponse(policies, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /attendance/policies error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createAttendancePolicySchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const policy = await prisma.attendancePolicy.create({
      data: {
        orgId,
        name: data.name,
        applicableTo: data.applicableTo ? JSON.parse(JSON.stringify(data.applicableTo)) : undefined,
        graceMinutes: data.graceMinutes,
        halfDayThresholdHours: data.halfDayThresholdHours,
        fullDayThresholdHours: data.fullDayThresholdHours,
        minHoursForOvertime: data.minHoursForOvertime,
        ipWhitelist: data.ipWhitelist ? JSON.parse(JSON.stringify(data.ipWhitelist)) : undefined,
        geoFenceRadius: data.geoFenceRadius,
        geoFenceCoordinates: data.geoFenceCoordinates ? JSON.parse(JSON.stringify(data.geoFenceCoordinates)) : undefined,
        allowWebCheckin: data.allowWebCheckin,
        allowMobileCheckin: data.allowMobileCheckin,
        requireLocationForMobile: data.requireLocationForMobile,
        latePenalization: data.latePenalization ? JSON.parse(JSON.stringify(data.latePenalization)) : undefined,
        absentPenalization: data.absentPenalization ? JSON.parse(JSON.stringify(data.absentPenalization)) : undefined,
        allowRegularization: data.allowRegularization,
        regularizationApprovalLevels: data.regularizationApprovalLevels,
        maxRegularizationsPerMonth: data.maxRegularizationsPerMonth,
        isDefault: data.isDefault,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return successResponse(policy, undefined, 201);
  } catch (error) {
    console.error("POST /attendance/policies error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.attendance.manage"] });
