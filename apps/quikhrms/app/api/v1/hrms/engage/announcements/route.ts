import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createAnnouncementSchema } from "@/lib/validations/engage";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { fireWorkflow } from "@/lib/workflows/executor";
import { moderationRequired, notifyApprovers } from "@/lib/services/content-moderation";

export const GET = withAuth(async (req: NextRequest, { orgId, permissions }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const statusFilter = searchParams.get("status"); // "Pending" | "Approved" | "Rejected" | null

    const canApprove = permissions.includes("*") || permissions.includes("hrms.engage.approve");
    const where: Record<string, unknown> = { orgId, deletedAt: null };
    if (statusFilter && canApprove) {
      where.approvalStatus = statusFilter;
    } else if (!canApprove) {
      // Non-approvers only see Approved content
      where.approvalStatus = "Approved";
    }

    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        where, orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }], skip: (page - 1) * limit, take: limit,
        include: { author: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
      }),
      prisma.announcement.count({ where }),
    ]);
    return successResponse(announcements, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /engage/announcements error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createAnnouncementSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const authorId = await resolveEmployeeId(orgId, userId);
    if (!authorId) return validationError("Employee record not found for current user");

    const needsApproval = await moderationRequired(orgId, "Engagement");

    const ann = await prisma.announcement.create({
      data: {
        orgId, authorId, title: data.title, content: data.content,
        attachments: data.attachments ? JSON.parse(JSON.stringify(data.attachments)) : undefined,
        visibility: data.visibility,
        targetDepartments: data.targetDepartments ? JSON.parse(JSON.stringify(data.targetDepartments)) : undefined,
        targetLocations: data.targetLocations ? JSON.parse(JSON.stringify(data.targetLocations)) : undefined,
        isPinned: data.isPinned,
        publishedAt: needsApproval ? null : (data.publishedAt ? new Date(data.publishedAt) : new Date()),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        approvalStatus: needsApproval ? "Pending" : "Approved",
        approvedById: needsApproval ? null : userId,
        approvedAt: needsApproval ? null : new Date(),
        createdBy: userId, updatedBy: userId,
      },
    });

    if (!needsApproval) {
      void fanOutAnnouncementNotifications({
        orgId,
        announcementId: ann.id,
        authorId,
        title: data.title,
        content: data.content,
        visibility: data.visibility,
        isPinned: data.isPinned,
        targetDepartments: data.targetDepartments,
      });

      void fireWorkflow({
        orgId, event: "engage.announcement.published",
        payload: { announcementId: ann.id, authorId, visibility: ann.visibility, title: ann.title },
      });
    } else {
      // Notify approvers
      void notifyApprovers(orgId, "Engagement", "Announcement", ann.id, data.title);
    }

    return successResponse(ann, undefined, 201);
  } catch (error) { console.error("POST /engage/announcements error:", error); return internalError(); }
});

async function fanOutAnnouncementNotifications(args: {
  orgId: string;
  announcementId: string;
  authorId: string;
  title: string;
  content: string;
  visibility: "Organization" | "Department" | "Team" | "Custom";
  isPinned: boolean;
  targetDepartments?: string[];
}) {
  try {
    const { orgId, announcementId, authorId, title, content, visibility, isPinned } = args;

    let departmentFilter: string[] | null = null;
    if (visibility === "Department" || visibility === "Custom") {
      if (args.targetDepartments && args.targetDepartments.length > 0) {
        departmentFilter = args.targetDepartments;
      } else {
        const author = await prisma.employee.findFirst({
          where: { id: authorId, orgId, deletedAt: null },
          select: { departmentId: true },
        });
        if (author?.departmentId) departmentFilter = [author.departmentId];
      }
    } else if (visibility === "Team") {
      const author = await prisma.employee.findFirst({
        where: { id: authorId, orgId, deletedAt: null },
        select: { departmentId: true },
      });
      if (author?.departmentId) departmentFilter = [author.departmentId];
    }

    const recipients = await prisma.employee.findMany({
      where: {
        orgId,
        deletedAt: null,
        status: "Active",
        id: { not: authorId },
        ...(departmentFilter && { departmentId: { in: departmentFilter } }),
      },
      select: { id: true },
    });

    if (recipients.length === 0) return;

    const preview = content.length > 120 ? `${content.slice(0, 120)}…` : content;
    const author = await prisma.employee.findFirst({
      where: { id: authorId, orgId, deletedAt: null },
      select: { firstName: true, lastName: true },
    });
    const authorName = author ? `${author.firstName} ${author.lastName}`.trim() : "Someone";

    await prisma.hrmsNotification.createMany({
      data: recipients.map((r) => ({
        orgId,
        employeeId: r.id,
        type: "Info" as const,
        channel: "InApp" as const,
        title: `${isPinned ? "📌 " : "📣 "}${title}`,
        message: `${authorName} posted a new announcement. ${preview}`,
        link: "/engage/announcements",
        entityType: "Announcement",
        entityId: announcementId,
      })),
    });
  } catch (error) {
    console.error("fanOutAnnouncementNotifications error:", error);
  }
}
