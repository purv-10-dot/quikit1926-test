import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, forbidden, internalError } from "@/lib/api-response";
import { fireWorkflow } from "@/lib/workflows/executor";

const ENGAGE_TYPES = ["announcement", "post", "recognition"] as const;
const FEEDBACK_TYPES = ["feedback"] as const;
type ContentType = (typeof ENGAGE_TYPES)[number] | (typeof FEEDBACK_TYPES)[number];

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});

function requiredPerm(type: ContentType): string {
  return type === "feedback" ? "hrms.feedback.approve" : "hrms.engage.approve";
}

/**
 * POST /api/v1/hrms/engage/approvals/:type/:id
 * type: announcement | post | recognition | feedback
 * body: { action: "approve" | "reject", reason?: string }
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const { type, id } = params as { type: string; id: string };
    if (!(ENGAGE_TYPES as readonly string[]).includes(type) && !(FEEDBACK_TYPES as readonly string[]).includes(type)) {
      return notFound("Unknown content type");
    }
    const t = type as ContentType;

    const perm = requiredPerm(t);
    if (!permissions.includes("*") && !permissions.includes(perm)) {
      return forbidden(`Missing permission: ${perm}`);
    }

    const body = await req.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { action, reason } = parsed.data;
    const isApprove = action === "approve";
    const now = new Date();

    const updateData = isApprove
      ? { approvalStatus: "Approved" as const, approvedById: userId, approvedAt: now, rejectionReason: null, updatedBy: userId }
      : { approvalStatus: "Rejected" as const, approvedById: userId, approvedAt: now, rejectionReason: reason ?? "Rejected by moderator", updatedBy: userId };

    let result: { id: string; authorId: string | null; title: string } | null = null;

    if (t === "announcement") {
      const existing = await prisma.announcement.findFirst({ where: { id, orgId, deletedAt: null } });
      if (!existing) return notFound("Announcement not found");
      const upd = await prisma.announcement.update({
        where: { id },
        data: { ...updateData, publishedAt: isApprove ? (existing.publishedAt ?? now) : null },
      });
      result = { id: upd.id, authorId: upd.authorId, title: upd.title };
    } else if (t === "post") {
      const existing = await prisma.socialPost.findFirst({ where: { id, orgId, deletedAt: null } });
      if (!existing) return notFound("Post not found");
      const upd = await prisma.socialPost.update({ where: { id }, data: updateData });
      result = { id: upd.id, authorId: upd.employeeId, title: upd.content.slice(0, 80) };
    } else if (t === "recognition") {
      const existing = await prisma.recognition.findFirst({ where: { id, orgId } });
      if (!existing) return notFound("Recognition not found");
      const upd = await prisma.recognition.update({
        where: { id },
        data: {
          approvalStatus: updateData.approvalStatus,
          approvedById: updateData.approvedById,
          approvedAt: updateData.approvedAt,
          rejectionReason: updateData.rejectionReason,
        },
      });
      result = { id: upd.id, authorId: upd.fromEmployeeId, title: upd.message.slice(0, 80) };
    } else if (t === "feedback") {
      const existing = await prisma.continuousFeedback.findFirst({ where: { id, orgId } });
      if (!existing) return notFound("Feedback not found");
      const upd = await prisma.continuousFeedback.update({
        where: { id },
        data: {
          approvalStatus: updateData.approvalStatus,
          approvedById: updateData.approvedById,
          approvedAt: updateData.approvedAt,
          rejectionReason: updateData.rejectionReason,
        },
      });
      result = { id: upd.id, authorId: upd.fromEmployeeId, title: upd.message.slice(0, 80) };

      if (isApprove && existing.isPublic && (existing.type === "Praise" || existing.type === "Recognition")) {
        const recogType = existing.type === "Recognition" ? "Award" : "Kudos";
        await prisma.recognition.create({
          data: {
            orgId,
            fromEmployeeId: existing.fromEmployeeId,
            toEmployeeId: existing.toEmployeeId,
            type: recogType,
            message: existing.message,
            badge: existing.category,
            points: 0,
            isPublic: true,
            approvalStatus: "Approved",
            approvedById: userId,
            approvedAt: now,
          },
        });
      }
      if (isApprove && existing.toEmployeeId !== existing.fromEmployeeId) {
        await prisma.hrmsNotification.create({
          data: {
            orgId,
            employeeId: existing.toEmployeeId,
            type: existing.type === "Constructive" ? "Info" : "Success",
            channel: "InApp",
            title: `New ${existing.type} feedback`,
            message: existing.message.slice(0, 80),
            link: "/performance/feedback",
            entityType: "ContinuousFeedback",
            entityId: existing.id,
          },
        });
      }
    }

    if (!result) return notFound();

    // Notify author of decision
    if (result.authorId) {
      await prisma.hrmsNotification.create({
        data: {
          orgId,
          employeeId: result.authorId,
          type: isApprove ? "Success" : "Warning",
          channel: "InApp",
          title: isApprove ? "Approved" : "Rejected",
          message: isApprove
            ? `Your ${t} "${result.title}" was approved.`
            : `Your ${t} was rejected${reason ? `: ${reason}` : "."}`,
          link: t === "feedback" ? "/performance/feedback" : "/engage",
          entityType: t,
          entityId: result.id,
        },
      });
    }

    if (isApprove) {
      void fireWorkflow({
        orgId,
        event: t === "feedback" ? "feedback.approved" : `engage.${t}.approved`,
        payload: { id: result.id, authorId: result.authorId },
      });
    }

    return successResponse({ id: result.id, action, type: t });
  } catch (error) {
    console.error("POST /engage/approvals error:", error);
    return internalError();
  }
});
