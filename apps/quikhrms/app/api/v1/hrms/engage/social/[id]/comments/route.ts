import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { createCommentSchema } from "@/lib/validations/engage";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const post = await prisma.socialPost.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!post) return notFound("Post not found");

    const body = await req.json();
    const parsed = createCommentSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const comment = await prisma.postComment.create({
      data: { orgId, postId: params.id, employeeId: userId, content: parsed.data.content },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    return successResponse(comment, undefined, 201);
  } catch (error) { console.error("POST /engage/social/:id/comments error:", error); return internalError(); }
});
