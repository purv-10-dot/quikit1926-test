import { db } from "@/lib/db";
import { emailProjectInvite } from "@/lib/email/sendEmail";

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
    if (!recipient?.email) return;
    await emailProjectInvite({
      to: recipient.email,
      recipientName:
        [recipient.firstName, recipient.lastName].filter(Boolean).join(" ").trim() || null,
      projectId: args.projectId,
      projectName: project?.name ?? "a project",
      invitedBy: actor
        ? [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() || null
        : null,
    });
  } catch (e) {
    console.error("[projectInvite] failed:", e instanceof Error ? e.message : e);
  }
}
