import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

/**
 * GET /api/v1/hrms/pre-onboarding/roster
 * Lists employees whose onboarding instance is still in the "PreOnboarding"
 * phase (pre-joining). `phase` is a raw-SQL column on OnboardingInstance, so we
 * resolve the matching employeeIds first, then load the employees.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim();

    // employeeIds whose instance is in the PreOnboarding phase.
    const phaseRows = await prisma.$queryRaw<Array<{ employeeId: string }>>`
      SELECT "employeeId" FROM "app_quikhrms"."OnboardingInstance"
      WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND phase = 'PreOnboarding'`;
    const employeeIds = phaseRows.map((r) => r.employeeId);
    if (employeeIds.length === 0) return successResponse([]);

    const employees = await prisma.employee.findMany({
      where: {
        orgId,
        deletedAt: null,
        id: { in: employeeIds },
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
            { workEmail: { contains: search, mode: "insensitive" as const } },
            { personalEmail: { contains: search, mode: "insensitive" as const } },
            { employeeCode: { contains: search, mode: "insensitive" as const } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        displayName: true,
        jobTitle: true,
        dateOfJoining: true,
        department: { select: { id: true, name: true } },
      },
    });

    return successResponse(employees);
  } catch (error) {
    console.error("GET /pre-onboarding/roster error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.read"] });
