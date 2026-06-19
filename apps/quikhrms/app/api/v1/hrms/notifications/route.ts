import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createNotificationSchema } from "@/lib/validations/system";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { invalidateKeys, cacheKeys } from "@/lib/services/cache";

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const unreadOnly = searchParams.get("unread") === "true";

    const where = { orgId, employeeId: userId, ...(unreadOnly && { isRead: false }) };

    const [notifications, total] = await Promise.all([
      prisma.hrmsNotification.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          link: true,
          isRead: true,
          createdAt: true,
          entityType: true,
          entityId: true,
        },
      }),
      prisma.hrmsNotification.count({ where }),
    ]);

    return successResponse(notifications, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /notifications error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const body = await req.json();
    const parsed = createNotificationSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const notification = await prisma.hrmsNotification.create({
      data: { orgId, ...data },
    });
    return successResponse(notification, undefined, 201);
  } catch (error) { console.error("POST /notifications error:", error); return internalError(); }
});

/** PATCH — mark all as read */
export const PATCH = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    await prisma.hrmsNotification.updateMany({
      where: { orgId, employeeId: userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    await invalidateKeys(cacheKeys.notifUnread(orgId, userId));
    return successResponse({ success: true });
  } catch (error) { console.error("PATCH /notifications error:", error); return internalError(); }
});
