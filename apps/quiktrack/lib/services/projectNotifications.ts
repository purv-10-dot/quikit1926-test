import { db } from "@/lib/db";
import { emailProjectInvite } from "@/lib/email/sendEmail";
import { notifyDirect, isEmailEnabled } from "@/lib/notifications/notify";

/**
 * Email a person that they've been added to a project. Used when an existing
 * org/app member is added to a space (the Add-people / Add-member flows) — they
 * skip the new-user onboarding email, so without this they'd be added silently.
 *
 * Best-effort + fire-and-forget: never throws into the caller, never emails the
 * actor about their own action.
 */
export async function notifyProjectInvite(args: {
  orgId: string;
  projectId: string;
  recipientUserId: string;
  actorUserId: string;
}): Promise<void> {
  try {
    if (args.recipientUserId === args.actorUserId) return;
    const [recipient, project, actor] = await Promise.all([
      db.user.findUnique({
        where: { id: args.recipientUserId },
        select: { email: true, firstName: true, lastName: true },
      }),
      db.qtProject.findUnique({ where: { id: args.projectId }, select: { name: true } }),
      db.user.findUnique({
        where: { id: args.actorUserId },
        select: { firstName: true, lastName: true },
      }),
    ]);
    const projectName = project?.name ?? "a project";
    const invitedBy = actor
      ? [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() || null
      : null;

    let emailSent = false;
    if (recipient?.email && (await isEmailEnabled(args.recipientUserId))) {
      await emailProjectInvite({
        to: recipient.email,
        recipientName:
          [recipient.firstName, recipient.lastName].filter(Boolean).join(" ").trim() || null,
        projectId: args.projectId,
        projectName,
        invitedBy,
      });
      emailSent = true;
    }

    await notifyDirect({
      orgId: args.orgId,
      recipientId: args.recipientUserId,
      actorId: args.actorUserId,
      type: "PROJECT_INVITE",
      projectId: args.projectId,
      snippet: invitedBy ? `${invitedBy} added you to "${projectName}"` : `Added you to "${projectName}"`,
      emailSent,
    });
  } catch (e) {
    console.error("[projectInvite] failed:", e instanceof Error ? e.message : e);
  }
}
