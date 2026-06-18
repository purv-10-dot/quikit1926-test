import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { invalidateKeys, cacheKeys } from "@/lib/services/cache";

export const PUT = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const result = await prisma.hrmsNotification.updateMany({
      where: { orgId, employeeId: userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    await invalidateKeys(cacheKeys.notifUnread(orgId, userId));
    return successResponse({ updated: result.count });
  } catch (error) {
    console.error("PUT /notifications/read-all error:", error);
    return internalError();
  }
});
