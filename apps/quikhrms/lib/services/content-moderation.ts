import { prisma } from "@/lib/prisma";

export type ModerationModule = "Engagement" | "Feedback";

/**
 * Returns true when an active ApprovalChain exists for the given module
 * in the tenant. When true, content (Announcement / SocialPost / Recognition /
 * ContinuousFeedback) is created in `Pending` and held until approval.
 *
 * Cached briefly per call site only — keep DB hit lightweight (indexed).
 */
export async function moderationRequired(
  orgId: string,
  module: ModerationModule,
): Promise<boolean> {
  const chain = await prisma.approvalChain.findFirst({
    where: { orgId, module, isActive: true, deletedAt: null },
    select: { id: true },
  });
  return !!chain;
}

export const APPROVED_STATUS = "Approved" as const;
export const PENDING_STATUS = "Pending" as const;
export const REJECTED_STATUS = "Rejected" as const;

type ModeratableEntity = "Announcement" | "SocialPost" | "Recognition" | "ContinuousFeedback";

const ENTITY_LINK: Record<ModeratableEntity, string> = {
  Announcement: "/engage/approvals?tab=announcement",
  SocialPost: "/engage/approvals?tab=post",
  Recognition: "/engage/approvals?tab=recognition",
  ContinuousFeedback: "/engage/approvals?tab=feedback",
};

const APPROVER_PERM: Record<ModerationModule, string> = {
  Engagement: "hrms.engage.approve",
  Feedback: "hrms.feedback.approve",
};

/**
 * Notify all employees with the approval permission for a pending item.
 * Best-effort: never throw.
 */
export async function notifyApprovers(
  orgId: string,
  module: ModerationModule,
  entityType: ModeratableEntity,
  entityId: string,
  title: string,
): Promise<void> {
  try {
    const perm = APPROVER_PERM[module];
    // RBAC v2: permission is (resource, action) — split on last dot.
    const lastDot = perm.lastIndexOf(".");
    const resource = lastDot < 0 ? perm : perm.slice(0, lastDot);
    const action = lastDot < 0 ? "*" : perm.slice(lastDot + 1);
    const approvers = await prisma.employee.findMany({
      where: {
        orgId,
        deletedAt: null,
        status: "Active",
        appRoles: {
          some: {
            role: {
              permissions: { some: { resource, action } },
            },
          },
        },
      },
      select: { id: true },
    });
    if (approvers.length === 0) return;
    await prisma.hrmsNotification.createMany({
      data: approvers.map((a) => ({
        orgId,
        employeeId: a.id,
        type: "Info" as const,
        channel: "InApp" as const,
        title: `Pending approval: ${title.slice(0, 80)}`,
        message: `New ${entityType.replace(/([A-Z])/g, " $1").trim()} waiting for moderation.`,
        link: ENTITY_LINK[entityType],
        entityType,
        entityId,
      })),
    });
  } catch (err) {
    console.error("notifyApprovers error:", err);
  }
}
