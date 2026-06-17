import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateAnnouncementSchema } from "@/lib/validations/engage";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const ann = await prisma.announcement.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!ann) return notFound("Announcement not found");
    return successResponse(ann);
  } catch (error) { console.error("GET /engage/announcements/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.announcement.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Announcement not found");
    const body = await req.json();
    const parsed = updateAnnouncementSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const ann = await prisma.announcement.update({ where: { id: params.id }, data: { ...parsed.data, updatedBy: userId } });
    return successResponse(ann);
  } catch (error) { console.error("PATCH /engage/announcements/:id error:", error); return internalError(); }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.announcement.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Announcement not found");
    await prisma.announcement.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return successResponse({ deleted: true });
  } catch (error) { console.error("DELETE /engage/announcements/:id error:", error); return internalError(); }
});
