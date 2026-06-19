import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createRecognitionSchema } from "@/lib/validations/engage";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { fireWorkflow } from "@/lib/workflows/executor";
import { moderationRequired, notifyApprovers } from "@/lib/services/content-moderation";

export const GET = withAuth(async (req: NextRequest, { orgId, permissions }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const toEmployeeId = searchParams.get("toEmployeeId");
    const statusFilter = searchParams.get("status");
    const canApprove = permissions.includes("*") || permissions.includes("hrms.engage.approve");

    const where: Record<string, unknown> = { orgId, ...(toEmployeeId && { toEmployeeId }) };
    if (statusFilter && canApprove) where.approvalStatus = statusFilter;
    else if (!canApprove) where.approvalStatus = "Approved";

    const [recognitions, total] = await Promise.all([
      prisma.recognition.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        include: {
          fromEmployee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
          toEmployee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true } },
        },
      }),
      prisma.recognition.count({ where }),
    ]);
    return successResponse(recognitions, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /engage/recognition error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createRecognitionSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const needsApproval = await moderationRequired(orgId, "Engagement");

    const recognition = await prisma.recognition.create({
      data: {
        orgId, fromEmployeeId: userId, toEmployeeId: data.toEmployeeId,
        type: data.type, message: data.message, badge: data.badge,
        points: data.points, isPublic: data.isPublic,
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
      void fireWorkflow({
        orgId, event: "engage.recognition.given",
        payload: {
          recognitionId: recognition.id,
          fromEmployeeId: recognition.fromEmployeeId,
          toEmployeeId: recognition.toEmployeeId,
          employeeId: recognition.toEmployeeId,
          type: recognition.type,
          points: recognition.points,
        },
      });
    } else {
      void notifyApprovers(orgId, "Engagement", "Recognition", recognition.id, data.message.slice(0, 80));
    }

    return successResponse(recognition, undefined, 201);
  } catch (error) { console.error("POST /engage/recognition error:", error); return internalError(); }
});
