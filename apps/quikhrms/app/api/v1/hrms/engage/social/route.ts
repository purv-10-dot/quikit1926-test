import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createSocialPostSchema, visibilityToDb } from "@/lib/validations/engage";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { fireWorkflow } from "@/lib/workflows/executor";
import { moderationRequired, notifyApprovers } from "@/lib/services/content-moderation";

export const GET = withAuth(async (req: NextRequest, { orgId, userId, permissions }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const type = searchParams.get("type");
    const statusFilter = searchParams.get("status");
    // engage-approve / admin manage & moderate — they see every post.
    const canManage = permissions.includes("*") || permissions.includes("hrms.engage.approve");

    const employeeId = await resolveEmployeeId(orgId, userId);
    const viewer = employeeId
      ? await prisma.employee.findFirst({ where: { id: employeeId, orgId, deletedAt: null }, select: { departmentId: true, teamId: true } })
      : null;

    const where: Record<string, unknown> = {
      orgId,
      deletedAt: null,
      ...(type && { type: type as "Update" | "RecognitionPost" | "Birthday" }),
    };

    if (canManage) {
      if (statusFilter) where.approvalStatus = statusFilter;
      // No visibility/schedule gate — moderators see all.
    } else {
      // Enforce the stored visibility: Organization to everyone; Department only
      // to same-department viewers; Team only to viewers sharing the team; Custom
      // stays private (author/moderators only). PLUS a scheduling gate that hides
      // future-scheduled posts. The author ALWAYS sees their own posts (any
      // status / visibility / schedule).
      const now = new Date();
      const visClauses: Record<string, unknown>[] = [{ visibility: "Organization" }];
      if (viewer?.departmentId) visClauses.push({ visibility: "Department", employee: { departmentId: viewer.departmentId } });
      if (viewer?.teamId) visClauses.push({ visibility: "HrmsTeam", employee: { teamId: viewer.teamId } });
      where.OR = [
        ...(employeeId ? [{ employeeId }] : []),
        {
          AND: [
            { approvalStatus: "Approved" },
            { OR: visClauses },
            { OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
          ],
        },
      ];
    }

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

    // Real scheduling: a post scheduled for the future must NOT go live now. With
    // no background publisher job, a future post is kept Pending (not
    // Approved+visible) — it's published when a moderator approves it, and the
    // GET scheduledAt gate additionally keeps it hidden from normal viewers until
    // its time arrives.
    const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : undefined;
    const scheduledFuture = !!scheduledAt && scheduledAt.getTime() > Date.now();
    const pending = needsApproval || scheduledFuture;

    const post = await prisma.socialPost.create({
      data: {
        orgId, employeeId, type: data.type, content: data.content,
        attachments: data.attachments ? JSON.parse(JSON.stringify(data.attachments)) : undefined,
        pollData: data.pollData ? JSON.parse(JSON.stringify(data.pollData)) : undefined,
        visibility: visibilityToDb(data.visibility),
        scheduledAt,
        approvalStatus: pending ? "Pending" : "Approved",
        approvedById: pending ? null : userId,
        approvedAt: pending ? null : new Date(),
        createdBy: userId, updatedBy: userId,
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
    });

    if (!pending) {
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
