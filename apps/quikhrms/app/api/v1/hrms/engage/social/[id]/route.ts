import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError, forbidden, validationError } from "@/lib/api-response";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const post = await prisma.socialPost.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true } },
        comments: { orderBy: { createdAt: "asc" }, include: { employee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } } },
      },
    });
    if (!post) return notFound("Post not found");
    return successResponse(post);
  } catch (error) { console.error("GET /engage/social/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.socialPost.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Post not found");

    const body = await req.json();

    // Like/unlike
    if (body.action === "like") {
      const likes = (existing.likes as string[]) ?? [];
      const isLiking = !likes.includes(userId);
      const updated = isLiking ? [...likes, userId] : likes.filter((l) => l !== userId);
      const post = await prisma.socialPost.update({
        where: { id: params.id }, data: { likes: JSON.parse(JSON.stringify(updated)) },
      });

      // Notify post author when someone else likes their post
      if (isLiking && existing.employeeId && userId !== existing.employeeId) {
        const liker = await prisma.employee.findFirst({
          where: { orgId, id: userId, deletedAt: null },
          select: { firstName: true, lastName: true },
        });
        const likerName = liker ? `${liker.firstName} ${liker.lastName}`.trim() : "Someone";
        const preview = (existing.content ?? "").slice(0, 60);
        await prisma.hrmsNotification.create({
          data: {
            orgId,
            employeeId: existing.employeeId,
            type: "Info",
            channel: "InApp",
            title: `${likerName} liked your post`,
            message: preview ? `"${preview}${existing.content && existing.content.length > 60 ? "…" : ""}"` : "Tap to view post",
            link: `/hrms?postId=${existing.id}`,
            entityType: "SocialPost",
            entityId: existing.id,
          },
        });
      }

      return successResponse(post);
    }

    // Pin/unpin
    if (body.isPinned !== undefined) {
      const post = await prisma.socialPost.update({ where: { id: params.id }, data: { isPinned: body.isPinned, updatedBy: userId } });
      return successResponse(post);
    }

    // Edit content (author only)
    if (typeof body.content === "string") {
      if (existing.employeeId !== userId) {
        return forbidden("Only the author can edit this post");
      }
      const trimmed = body.content.trim();
      if (!trimmed) return validationError("Content is required");
      const post = await prisma.socialPost.update({
        where: { id: params.id },
        data: { content: trimmed, updatedBy: userId },
      });
      return successResponse(post);
    }

    return successResponse(existing);
  } catch (error) { console.error("PATCH /engage/social/:id error:", error); return internalError(); }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const existing = await prisma.socialPost.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Post not found");

    const isAuthor = existing.employeeId === userId;
    const isAdmin = permissions.includes("*") || permissions.includes("hrms.engage.manage");
    if (!isAuthor && !isAdmin) return forbidden("Only the author can delete this post");

    await prisma.socialPost.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return successResponse({ deleted: true });
  } catch (error) { console.error("DELETE /engage/social/:id error:", error); return internalError(); }
});
