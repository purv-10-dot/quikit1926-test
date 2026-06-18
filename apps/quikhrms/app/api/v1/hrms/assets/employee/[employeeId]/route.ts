import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withAuth(async (req: NextRequest, { orgId }, params) => {
  try {
    const { searchParams } = new URL(req.url);
    const includeHistory = searchParams.get("includeHistory") === "true";

    const where = {
      orgId,
      employeeId: params.employeeId,
      deletedAt: null,
      ...(!includeHistory && { status: "AssignmentActive" as const }),
    };

    const assignments = await prisma.assetAssignment.findMany({
      where,
      orderBy: { assignedAt: "desc" },
      include: {
        asset: {
          select: {
            id: true, assetCode: true, name: true, category: true, brand: true, model: true,
            serialNumber: true, status: true, condition: true, warrantyExpiry: true,
          },
        },
      },
    });

    return successResponse(assignments);
  } catch (error) {
    console.error("GET /assets/employee/[employeeId] error:", error);
    return internalError();
  }
});
