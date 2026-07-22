import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, forbidden } from "@/lib/api-response";
import { bulkShiftAssignmentSchema } from "@/lib/validations/shift";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { getCallerEmployeeId } from "@/lib/rbac/scope";
import { getHierarchyAccessibleEmployeeIds } from "@/lib/rbac/hierarchy";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const employeeId = searchParams.get("employeeId");
    const shiftId = searchParams.get("shiftId");

    const where = {
      orgId,
      deletedAt: null,
      ...(employeeId && { employeeId }),
      ...(shiftId && { shiftId }),
    };

    const [assignments, total] = await Promise.all([
      prisma.shiftAssignment.findMany({
        where,
        orderBy: { effectiveFrom: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          shift: { select: { id: true, name: true, code: true, startTime: true, endTime: true, color: true } },
        },
      }),
      prisma.shiftAssignment.count({ where }),
    ]);

    return successResponse(assignments, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /shifts/assignments error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, userId, permissions } = ctx;
    const body = await req.json();
    const parsed = bulkShiftAssignmentSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const callerEmpId = await getCallerEmployeeId(ctx);

    // Resolve target employees: explicit list → single → fall back to self.
    let targets = data.employeeIds?.length
      ? Array.from(new Set(data.employeeIds))
      : data.employeeId
        ? [data.employeeId]
        : [];
    if (targets.length === 0) {
      if (!callerEmpId) return validationError("Employee required");
      targets = [callerEmpId];
    }

    // Assigning to anyone but yourself needs manage permission + hierarchy access.
    const assigningOthers = targets.some((id) => id !== callerEmpId);
    if (assigningOthers) {
      const canManage = permissions.includes("*") || permissions.includes("hrms.attendance.manage");
      if (!canManage) return forbidden("You can only change your own shift");
      const hierarchy = await getHierarchyAccessibleEmployeeIds(ctx);
      if (!hierarchy.unlimited) {
        const allowed = new Set(hierarchy.employeeIds ?? []);
        if (targets.some((id) => !allowed.has(id))) {
          return forbidden("Cannot assign a shift to an employee above your role hierarchy");
        }
      }
    }

    // Keep only employees that exist in this tenant.
    const existing = await prisma.employee.findMany({
      where: { orgId, deletedAt: null, id: { in: targets } },
      select: { id: true },
    });
    if (existing.length === 0) return validationError("No valid employees to assign");

    // Verify the shift exists in this org — otherwise createMany throws a Prisma
    // FK error that surfaces as a generic "Something went wrong".
    const shift = await prisma.shiftPolicy.findFirst({
      where: { id: data.shiftId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!shift) return validationError("The selected shift no longer exists.");

    const result = await prisma.shiftAssignment.createMany({
      data: existing.map((e) => ({
        orgId,
        employeeId: e.id,
        shiftId: data.shiftId,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo ?? undefined,
        isRotating: data.isRotating,
        rotationPattern: data.rotationPattern ? JSON.parse(JSON.stringify(data.rotationPattern)) : undefined,
        createdBy: userId,
        updatedBy: userId,
      })),
    });

    return successResponse({ count: result.count, employeeIds: existing.map((e) => e.id) }, undefined, 201);
  } catch (error) {
    console.error("POST /shifts/assignments error:", error);
    return internalError();
  }
});
