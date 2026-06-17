import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const now = new Date();

    const overdue = await prisma.assetAssignment.findMany({
      where: {
        orgId,
        deletedAt: null,
        status: "AssignmentActive",
        expectedReturnDate: { lt: now, not: null },
      },
      orderBy: { expectedReturnDate: "asc" },
      include: {
        asset: {
          select: { id: true, assetCode: true, name: true, category: true, brand: true, model: true },
        },
      },
    });

    const withDaysOverdue = overdue.map((a) => ({
      ...a,
      daysOverdue: a.expectedReturnDate
        ? Math.ceil((now.getTime() - a.expectedReturnDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0,
    }));

    return successResponse(withDaysOverdue);
  } catch (error) {
    console.error("GET /assets/overdue error:", error);
    return internalError();
  }
});
