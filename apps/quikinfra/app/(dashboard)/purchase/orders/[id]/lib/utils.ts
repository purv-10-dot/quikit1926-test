/** Pure helpers for the PO detail page. Extracted from page.tsx. */
import type { MeResponse } from "@/hooks/use-permissions";
import type { PoDetail } from "@/lib/purchase/po-detail";
import type { ApprovalStep } from "@/lib/approvals/approval-info";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";

/**
 * True when the logged-in user is the expected actor for the current
 * step. Mirrors the server-side `canActOnStep` so the Approve / Reject /
 * Return buttons only render for the actor who can actually use them.
 * Without this gate, ADMIN userTypes (and anyone with a stale matrix
 * permission) would see live buttons that the server now 403s on after
 * the bypass was tightened to SUPER_ADMIN only.
 */
export function canActOnCurrentStep(
  me: MeResponse | null | undefined,
  po: PoDetail | null | undefined,
): boolean {
  if (!me || !po?.approval) return false;
  if (po.approval.status !== "pending_approval") return false;
  const step = po.approval.workflow?.steps?.find(
    (s: ApprovalStep) => s.stepOrder === po.approval?.currentStepOrder,
  );
  if (!step) return false;
  return canActOnStep(
    {
      userId: me.userId,
      roleKey: me.roleKey,
      projectIds: me.projectIds ?? undefined,
    },
    {
      approverUserId: step.approverUserId ?? null,
      approverUserIds: Array.isArray(step.approverUserIds) ? step.approverUserIds : null,
      approverRoleId: step.approverRoleId ?? null,
    },
    po.projectId ?? null,
  );
}
