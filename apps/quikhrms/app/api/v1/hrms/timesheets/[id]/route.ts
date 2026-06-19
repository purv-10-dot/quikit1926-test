import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const sheet = await prisma.timesheet.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: { logs: { where: { deletedAt: null }, orderBy: { date: "asc" } } },
    });
    if (!sheet) return notFound("Timesheet not found");
    return successResponse(sheet);
  } catch (error) {
    console.error("GET /timesheets/[id] error:", error);
    return internalError();
  }
});
