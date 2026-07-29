import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 8);

    const reqs = await prisma.jobRequisition.findMany({
      where: {
        orgId,
        deletedAt: null,
        status: { in: ["ReqOpen", "ReqApproved"] },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, title: true, requisitionNumber: true,
        positions: true, filledPositions: true,
        employmentType: true, workLocation: true,
        department: { select: { name: true } },
      },
    });

    return successResponse(reqs);
  } catch (e) {
    console.error("GET /recruit/requisitions/openings error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.read"] });
