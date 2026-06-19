import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { invalidateKeys, cacheKeys } from "@/lib/services/cache";

export const PUT = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.hrmsNotification.findFirst({
      where: { id: params.id, orgId, employeeId: userId },
    });
    if (!existing) return notFound("Notification not found");

    const updated = await prisma.hrmsNotification.update({
      where: { id: params.id },
      data: { isRead: true, readAt: new Date() },
    });

    await invalidateKeys(cacheKeys.notifUnread(orgId, userId));

    return successResponse(updated);
  } catch (error) {
    console.error("PUT /notifications/[id]/read error:", error);
    return internalError();
  }
});
