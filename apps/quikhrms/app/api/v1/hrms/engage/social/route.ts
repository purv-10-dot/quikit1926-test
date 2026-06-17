import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createSocialPostSchema } from "@/lib/validations/engage";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { fireWorkflow } from "@/lib/workflows/executor";
import { moderationRequired, notifyApprovers } from "@/lib/services/content-moderation";

export const GET = withAuth(async (req: NextRequest, { orgId, permissions }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const type = searchParams.get("type");
    const statusFilter = searchParams.get("status");
    const canApprove = permissions.includes("*") || permissions.includes("hrms.engage.approve");

    const where: Record<string, unknown> = {
      orgId,
      deletedAt: null,
      ...(type && { type: type as "Update" | "RecognitionPost" | "Birthday" }),
    };
    if (statusFilter && canApprove) where.approvalStatus = statusFilter;
    else if (!canApprove) where.approvalStatus = "Approved";

    const [posts, total] = await Promise.all([
      prisma.socialPost.findMany({
        where, orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }], skip: (page - 1) * limit, take: limit,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true } },
          comments: { orderBy: { createdAt: "asc" }, take: 3, include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
          _count: { select: { comments: true } },
        },
      }),
      prisma.socialPost.count({ where }),
    ]);
    return successResponse(posts, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /engage/social error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createSocialPostSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return validationError("Employee record not found for current user");

    const needsApproval = await moderationRequired(orgId, "Engagement");

    const post = await prisma.socialPost.create({
      data: {
        orgId, employeeId, type: data.type, content: data.content,
        attachments: data.attachments ? JSON.parse(JSON.stringify(data.attachments)) : undefined,
        pollData: data.pollData ? JSON.parse(JSON.stringify(data.pollData)) : undefined,
        visibility: data.visibility,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        approvalStatus: needsApproval ? "Pending" : "Approved",
        approvedById: needsApproval ? null : userId,
        approvedAt: needsApproval ? null : new Date(),
        createdBy: userId, updatedBy: userId,
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
    });

    if (!needsApproval) {
      void fireWorkflow({
        orgId, event: "engage.social.post.created",
        payload: { postId: post.id, employeeId: post.employeeId, type: post.type },
      });
    } else {
      void notifyApprovers(orgId, "Engagement", "SocialPost", post.id, data.content.slice(0, 80));
    }

    return successResponse(post, undefined, 201);
  } catch (error) { console.error("POST /engage/social error:", error); return internalError(); }
});
