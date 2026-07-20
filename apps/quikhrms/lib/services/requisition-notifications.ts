import { prisma } from "@/lib/prisma";
import { publishNotification } from "@/lib/services/realtime";

type NotifType = "Info" | "Success" | "Warning" | "Error" | "Action";

/**
 * In-app notification for requisition approval events. Best-effort — never throws,
 * so it can't block the approve/reject request.
 */
async function notify(args: {
  orgId: string;
  recipients: string[];
  requisitionId: string;
  title: string;
  message: string;
  link: string;
  type?: NotifType;
}) {
  const unique = [...new Set(args.recipients.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    await prisma.hrmsNotification.createMany({
      data: unique.map((employeeId) => ({
        orgId: args.orgId,
        employeeId,
        type: args.type ?? "Action",
        channel: "InApp" as const,
        title: args.title,
        message: args.message,
        link: args.link,
        entityType: "Requisition",
        entityId: args.requisitionId,
      })),
    });
    publishNotification(args.orgId, unique, {
      title: args.title,
      message: args.message,
      type: args.type ?? "Action",
      link: args.link,
    }).catch(() => {});
  } catch (e) {
    console.error("requisition notify error:", e);
  }
}

/** Requisition fully approved → tell the raiser. */
export async function notifyRequisitionApproved(orgId: string, p: { requisitionId: string; title: string; raiserId?: string | null }) {
  if (!p.raiserId) return;
  await notify({
    orgId, recipients: [p.raiserId], requisitionId: p.requisitionId,
    type: "Success",
    title: "Requisition approved",
    message: `Your requisition "${p.title}" has been approved and is now open.`,
    link: "/recruit/requisitions",
  });
}

/** Requisition rejected → tell the raiser. */
export async function notifyRequisitionRejected(orgId: string, p: { requisitionId: string; title: string; raiserId?: string | null; comment?: string | null }) {
  if (!p.raiserId) return;
  await notify({
    orgId, recipients: [p.raiserId], requisitionId: p.requisitionId,
    type: "Error",
    title: "Requisition rejected",
    message: p.comment ? `Your requisition "${p.title}" was rejected: ${p.comment}` : `Your requisition "${p.title}" was rejected.`,
    link: "/recruit/requisitions?status=ReqCancelled",
  });
}

/**
 * Candidate responded to a "still interested?" invite after a hold-resume →
 * tell the recruiter / hiring manager so they can act.
 */
export async function notifyCandidateReconfirm(orgId: string, p: {
  requisitionId: string;
  requisitionTitle: string;
  candidateName: string;
  interested: boolean;
  recipients: (string | null | undefined)[];
}) {
  const recipients = p.recipients.filter((r): r is string => !!r);
  if (recipients.length === 0) return;
  await notify({
    orgId, recipients, requisitionId: p.requisitionId,
    type: p.interested ? "Success" : "Warning",
    title: p.interested ? "Candidate confirmed interest" : "Candidate withdrew",
    message: p.interested
      ? `${p.candidateName} confirmed they're still interested in "${p.requisitionTitle}" and is back in the pipeline.`
      : `${p.candidateName} is no longer interested in "${p.requisitionTitle}" and has been withdrawn.`,
    link: p.interested ? "/recruit/pipeline" : "/recruit/requisitions",
  });
}

/** Advanced to the next level → tell that approver it's waiting on them. */
export async function notifyRequisitionNextApprover(orgId: string, p: { requisitionId: string; title: string; approverId?: string | null }) {
  if (!p.approverId) return;
  await notify({
    orgId, recipients: [p.approverId], requisitionId: p.requisitionId,
    type: "Action",
    title: "Requisition awaiting your approval",
    message: `Requisition "${p.title}" needs your approval.`,
    link: "/recruit/approvals",
  });
}
