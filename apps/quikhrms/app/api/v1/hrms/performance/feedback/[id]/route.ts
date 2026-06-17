import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";

// ContinuousFeedback has no soft-delete column → hard delete.
export const DELETE = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const existing = await prisma.continuousFeedback.findFirst({
      where: { id: params.id, orgId },
    });
    if (!existing) return notFound("Feedback not found");
    await prisma.continuousFeedback.delete({ where: { id: params.id } });
    return successResponse({ id: params.id, deleted: true });
  } catch (e) {
    console.error("DELETE /performance/feedback/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
