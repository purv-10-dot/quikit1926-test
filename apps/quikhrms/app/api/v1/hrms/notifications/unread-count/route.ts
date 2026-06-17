import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { getCached, cacheKeys } from "@/lib/services/cache";

export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const data = await getCached(
      cacheKeys.notifUnread(orgId, userId),
      15, // 15s TTL — short since SSE invalidates on new notification
      () => prisma.hrmsNotification.count({ where: { orgId, employeeId: userId, isRead: false } }),
    );
    return successResponse({ count: data });
  } catch (error) {
    console.error("GET /notifications/unread-count error:", error);
    return internalError();
  }
});
