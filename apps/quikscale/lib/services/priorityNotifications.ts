import { db } from "@/lib/db";
import { sendEmail, buildPriorityAssignmentEmail } from "./email";
import { getAppBaseUrl } from "./appUrl";

export interface NotifyPriorityAssignmentParams {
  orgId: string;
  priorityId: string;
  priorityName: string;
  quarter: string;
  year: number;
  creatorUserId: string;
  ownerUserId: string;
}

/**
 * Persist in-app Notification rows and dispatch an assignment email when a
 * Priority is created. Email failures are logged + recorded but never thrown —
 * Priority creation must not roll back because SMTP was unreachable.
 */
export async function notifyPriorityAssignment(params: NotifyPriorityAssignmentParams): Promise<void> {
  const { orgId, priorityId, priorityName, quarter, year, creatorUserId, ownerUserId } = params;

  if (!ownerUserId) {
    console.log(`[notifyPriorityAssignment] no owner for priorityId=${priorityId}`);
    return;
  }
  console.log(`[notifyPriorityAssignment] priorityId=${priorityId} owner=${ownerUserId}`);

  const [creator, owner] = await Promise.all([
    db.user.findUnique({
      where: { id: creatorUserId },
      select: { firstName: true, lastName: true, email: true },
    }),
    db.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  if (!owner) {
    console.warn(`[notifyPriorityAssignment] owner user ${ownerUserId} not found`);
    return;
  }

  const creatorName = creator
    ? `${creator.firstName ?? ""} ${creator.lastName ?? ""}`.trim() || (creator.email ?? "A teammate")
    : "A teammate";

  const baseUrl = getAppBaseUrl();
  const priorityUrl = baseUrl ? `${baseUrl}/priority?highlight=${priorityId}` : undefined;

  const title = "A Priority has been assigned to you";
  const message = `${creatorName} assigned you "${priorityName}" for ${quarter} ${year}.`;

  await db.notification.create({
    data: {
      orgId,
      userId: owner.id,
      title,
      message,
      type: "priority_assigned",
      relatedEntityId: priorityId,
      relatedEntityType: "Priority",
      channel: "in_app",
    },
  });

  if (!owner.email) {
    console.warn(`[notifyPriorityAssignment] user ${owner.id} has no email — skipping send`);
    return;
  }

  const ownerName = `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim() || owner.email;
  const { subject, html, text } = buildPriorityAssignmentEmail({
    ownerName,
    priorityName,
    quarter,
    year,
    creatorName,
    priorityUrl,
  });

  const result = await sendEmail({ to: owner.email, subject, html, text });

  try {
    await db.notification.create({
      data: {
        orgId,
        userId: owner.id,
        title,
        message: result.ok
          ? `Email sent to ${owner.email}.`
          : `Email send failed: ${result.error ?? "unknown"}.`,
        type: result.ok ? "priority_assigned_email_sent" : "priority_assigned_email_failed",
        relatedEntityId: priorityId,
        relatedEntityType: "Priority",
        channel: "email",
      },
    });
  } catch (err) {
    console.error("[notifyPriorityAssignment] failed to log email outcome", err);
  }
}
