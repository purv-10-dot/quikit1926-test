import { prisma } from "@/lib/prisma";

export type ModerationModule = "Engagement" | "Feedback";

/**
 * Whether content must be held for approval before it goes live.
 *
 * Policy: approval is ALWAYS required — content (Announcement / SocialPost /
 * Recognition / ContinuousFeedback) is never auto-published. It is created in
 * `Pending` and held until a moderator acts on it.
 *
 * Who moderates:
 *  - When the tenant has configured an active ApprovalChain for the module,
 *    that module's designated approvers (holders of the approve permission)
 *    handle it.
 *  - When NO chain is configured (or no approver permission has been granted),
 *    it falls back to org admins (see `notifyApprovers`).
 *
 * `orgId`/`module` are kept in the signature for call-site clarity and future
 * per-module opt-outs; the current policy returns `true` unconditionally.
 */
export async function moderationRequired(
  _orgId: string,
  _module: ModerationModule,
): Promise<boolean> {
  return true;
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
 * Notify the moderators of a pending item. Resolves to the module's designated
 * approvers (holders of the approve permission); when none exist — i.e. no
 * approval chain has been configured — it falls back to org admins so nothing
 * is ever left un-moderated. Best-effort: never throw.
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
    let approvers = await prisma.employee.findMany({
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
    // Fallback: no chain configured / no approver permission granted → route to
    // org admins (the "admin" role carries `*`, so they can action it).
    if (approvers.length === 0) {
      approvers = await prisma.employee.findMany({
        where: {
          orgId,
          deletedAt: null,
          status: "Active",
          appRoles: { some: { role: { name: "admin" } } },
        },
        select: { id: true },
      });
    }
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
