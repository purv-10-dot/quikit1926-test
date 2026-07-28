import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createFeedbackSchema } from "@/lib/validations/performance";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { moderationRequired, notifyApprovers } from "@/lib/services/content-moderation";
import { getCallerEmployeeId, getCallerReporteeIds } from "@/lib/rbac/scope";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, permissions } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const toEmployeeId = searchParams.get("toEmployeeId");
    const fromEmployeeId = searchParams.get("fromEmployeeId");
    const isPublic = searchParams.get("isPublic");
    const type = searchParams.get("type");
    const category = searchParams.get("category");
    const statusFilter = searchParams.get("status");
    const canApprove = permissions.includes("*") || permissions.includes("hrms.feedback.approve");

    const where: Record<string, unknown> = {
      orgId,
      ...(toEmployeeId && { toEmployeeId }),
      ...(fromEmployeeId && { fromEmployeeId }),
      ...(isPublic === "true" && { isPublic: true }),
      ...(type && { type }),
      ...(category && { category }),
    };
    if (statusFilter && canApprove) {
      where.approvalStatus = statusFilter;
    } else if (!canApprove) {
      // Confidentiality: a non-approver may see feedback they authored, feedback
      // addressed to themselves or their direct reports (once approved), and
      // public approved feedback — never arbitrary approved feedback about
      // anyone else via ?toEmployeeId.
      const callerId = await getCallerEmployeeId(ctx);
      const reporteeIds = await getCallerReporteeIds(ctx);
      const myTargets = [callerId, ...reporteeIds].filter(Boolean) as string[];
      where.AND = [{
        OR: [
          { fromEmployeeId: callerId },
          { toEmployeeId: { in: myTargets }, approvalStatus: "Approved" },
          { isPublic: true, approvalStatus: "Approved" },
        ],
      }];
    }

    const [feedback, total] = await Promise.all([
      prisma.continuousFeedback.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        include: {
          fromEmployee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
          toEmployee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        },
      }),
      prisma.continuousFeedback.count({ where }),
    ]);
    return successResponse(feedback, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /performance/feedback error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createFeedbackSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const needsApproval = await moderationRequired(orgId, "Feedback");

    const fb = await prisma.continuousFeedback.create({
      data: {
        orgId, fromEmployeeId: userId, toEmployeeId: data.toEmployeeId,
        type: data.type, category: data.category, message: data.message,
        isPublic: data.isPublic,
        badges: data.badges ? JSON.parse(JSON.stringify(data.badges)) : undefined,
        relatedGoalId: data.relatedGoalId,
        approvalStatus: needsApproval ? "Pending" : "Approved",
        approvedById: needsApproval ? null : userId,
        approvedAt: needsApproval ? null : new Date(),
      },
      include: {
        fromEmployee: { select: { id: true, firstName: true, lastName: true } },
        toEmployee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!needsApproval) {
      // Mirror to social wall: only positive public feedback becomes a Recognition.
      if (data.isPublic && (data.type === "Praise" || data.type === "Recognition")) {
        const recogType = data.type === "Recognition" ? "Award" : "Kudos";
        await prisma.recognition.create({
          data: {
            orgId,
            fromEmployeeId: userId,
            toEmployeeId: data.toEmployeeId,
            type: recogType,
            message: data.message,
            badge: data.category,
            points: 0,
            isPublic: true,
          },
        });
      }

      // In-app notification to recipient (skip self-feedback).
      if (data.toEmployeeId !== userId) {
        const fromName = `${fb.fromEmployee.firstName} ${fb.fromEmployee.lastName}`.trim();
        const preview = data.message.length > 80 ? `${data.message.slice(0, 80)}…` : data.message;
        await prisma.hrmsNotification.create({
          data: {
            orgId,
            employeeId: data.toEmployeeId,
            type: data.type === "Constructive" ? "Info" : "Success",
            channel: "InApp",
            title: `${fromName} gave you ${data.type} feedback`,
            message: preview,
            link: "/performance/feedback",
            entityType: "ContinuousFeedback",
            entityId: fb.id,
          },
        });
      }
    } else {
      void notifyApprovers(orgId, "Feedback", "ContinuousFeedback", fb.id, data.message.slice(0, 80));
    }

    return successResponse(fb, undefined, 201);
  } catch (error) { console.error("POST /performance/feedback error:", error); return internalError(); }
});
