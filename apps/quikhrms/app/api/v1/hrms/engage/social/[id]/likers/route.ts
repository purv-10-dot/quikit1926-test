import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const post = await prisma.socialPost.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, likes: true },
    });
    if (!post) return notFound("Post not found");

    const likerIds = Array.isArray(post.likes) ? (post.likes as string[]) : [];
    if (likerIds.length === 0) return successResponse([]);

    const employees = await prisma.employee.findMany({
      where: { orgId, id: { in: likerIds }, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, profilePhoto: true,
        jobTitle: true,
        designation: { select: { title: true } },
      },
    });

    // Preserve like order (most-recent-last in array)
    const order = new Map(likerIds.map((id, i) => [id, i]));
    const sorted = employees
      .map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        profilePhoto: e.profilePhoto,
        title: e.designation?.title ?? e.jobTitle ?? null,
      }))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return successResponse(sorted);
  } catch (e) {
    console.error("GET /engage/social/:id/likers error:", e);
    return internalError();
  }
});
