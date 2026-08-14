import { db } from "@/lib/db";
import { sendEmail, buildHabitCampaignEmail, type HabitCampaignEvent } from "./email";
import { getAppBaseUrl } from "./appUrl";

/**
 * Lifecycle notifications for a Rockefeller Habits assessment.
 *
 * Recipients are the campaign's `participantUserIds`. An EMPTY list means the
 * campaign was created org-wide (every campaign predating that column, plus any
 * created without picking owners), so it falls back to every ACTIVE org member —
 * which is exactly who the participation panel counts.
 *
 * Mirrors `wwwNotifications`: in-app Notification rows plus an email per
 * recipient, with every failure logged and swallowed so a bad mailbox can never
 * fail the campaign action that triggered it.
 */

export interface NotifyHabitCampaignParams {
  orgId: string;
  campaignId: string;
  event: HabitCampaignEvent;
  actorUserId: string;
  quarter: string;
  year: number;
  deadline: Date | string | null;
  /** Empty ⇒ fall back to every active org member. */
  participantUserIds: string[];
}

function formatDeadline(deadline: Date | string | null): string | null {
  if (!deadline) return null;
  const d = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const NOTIFICATION_TYPE: Record<HabitCampaignEvent, string> = {
  created: "habit_campaign_created",
  launched: "habit_campaign_launched",
  deadline_changed: "habit_campaign_deadline_changed",
  closed: "habit_campaign_closed",
};

/**
 * Resolve the users to notify. Explicit participants win; otherwise every
 * active org member (the org-wide default).
 */
async function resolveRecipientIds(
  orgId: string,
  participantUserIds: string[],
): Promise<string[]> {
  const explicit = Array.from(new Set(participantUserIds.filter(Boolean)));
  if (explicit.length > 0) return explicit;

  const members = await db.orgMember.findMany({
    where: { orgId, status: "active" },
    select: { userId: true },
  });
  return Array.from(new Set(members.map((m) => m.userId).filter(Boolean)));
}

export async function notifyHabitCampaign(params: NotifyHabitCampaignParams): Promise<void> {
  const { orgId, campaignId, event, actorUserId, quarter, year, deadline, participantUserIds } =
    params;

  const recipientIds = await resolveRecipientIds(orgId, participantUserIds);
  if (recipientIds.length === 0) {
    console.log(`[notifyHabitCampaign] no recipients for campaignId=${campaignId}`);
    return;
  }
  console.log(
    `[notifyHabitCampaign] campaignId=${campaignId} event=${event} recipients=${recipientIds.length}`,
  );

  const [actor, recipients] = await Promise.all([
    db.user.findUnique({
      where: { id: actorUserId },
      select: { firstName: true, lastName: true, email: true },
    }),
    db.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  const actorName = actor
    ? `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim() || (actor.email ?? "An admin")
    : "An admin";

  const periodLabel = `${quarter} ${year}`;
  const deadlineLabel = formatDeadline(deadline);
  const baseUrl = getAppBaseUrl();
  const campaignUrl = baseUrl ? `${baseUrl}/performance/habits` : undefined;

  const { subject } = buildHabitCampaignEmail(event, {
    recipientName: "",
    periodLabel,
    actorName,
    deadlineLabel,
    campaignUrl,
  });
  const message =
    event === "deadline_changed"
      ? `${actorName} changed the ${periodLabel} Rockefeller Habits deadline to ${deadlineLabel ?? "none"}.`
      : `${actorName}: ${subject}`;

  await db.notification.createMany({
    data: recipients.map((r) => ({
      orgId,
      userId: r.id,
      title: subject,
      message,
      type: NOTIFICATION_TYPE[event],
      relatedEntityId: campaignId,
      relatedEntityType: "HabitAssessment",
      channel: "in_app",
    })),
  });

  await Promise.all(
    recipients.map(async (r) => {
      if (!r.email) {
        console.warn(`[notifyHabitCampaign] user ${r.id} has no email — skipping send`);
        return;
      }
      const recipientName = `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.email;
      const built = buildHabitCampaignEmail(event, {
        recipientName,
        periodLabel,
        actorName,
        deadlineLabel,
        campaignUrl,
      });

      const result = await sendEmail({
        to: r.email,
        subject: built.subject,
        html: built.html,
        text: built.text,
      });

      try {
        await db.notification.create({
          data: {
            orgId,
            userId: r.id,
            title: built.subject,
            message: result.ok
              ? `Email sent to ${r.email}.`
              : `Email send failed: ${result.error ?? "unknown"}.`,
            type: result.ok
              ? `${NOTIFICATION_TYPE[event]}_email_sent`
              : `${NOTIFICATION_TYPE[event]}_email_failed`,
            relatedEntityId: campaignId,
            relatedEntityType: "HabitAssessment",
            channel: "email",
          },
        });
      } catch (err) {
        console.error("[notifyHabitCampaign] failed to log email outcome", err);
      }
    }),
  );
}
