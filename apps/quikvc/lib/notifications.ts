/**
 * Notification helper — write VCNotification rows + send the email half.
 *
 * Call from any server route after a key event:
 *
 *   await notify({
 *     tenantId, userIds, type: "allocation",
 *     title: "Capital allocated", body: "...", href: "/deals/abc",
 *   });
 *
 * Two side-effects, both best-effort:
 *   1. Insert one VCNotification per recipient (in-app feed).
 *   2. Send an email per recipient via Resend (stub when RESEND_API_KEY unset).
 *
 * Set NOTIFICATIONS_EMAIL_ENABLED=false to disable the email half globally
 * (in-app feed still works).
 */
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import NotificationEmail from "@/lib/email/templates/notification";

export type NotificationType =
  | "allocation"
  | "repayment-schedule"
  | "repayment-payment"
  | "vote-cast"
  | "vote-settled"
  | "stage-advanced"
  | "memo-frozen"
  | "deal-assigned"
  | "term-sheet-generated"
  | "sourced-opportunity";

export interface NotifyInput {
  tenantId: string;
  /// Recipient user ids — duplicates are de-duped
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
}

/**
 * Email kill-switch. Defaults to true (email sent). Set NOTIFICATIONS_EMAIL_ENABLED=false
 * to disable globally — useful for local dev so test sends don't hit Resend.
 */
function emailEnabled(): boolean {
  const v = (process.env.NOTIFICATIONS_EMAIL_ENABLED ?? "true").toLowerCase().trim();
  return v !== "false" && v !== "0" && v !== "no";
}

/**
 * Persist one notification per recipient + send email per recipient.
 * Both side-effects are best-effort: failures are logged, never thrown.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const recipients = Array.from(new Set(input.userIds.filter(Boolean)));
  if (recipients.length === 0) return;

  // 1. In-app feed
  try {
    await db.vCNotification.createMany({
      data: recipients.map((userId) => ({
        tenantId: input.tenantId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href,
      })),
    });
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.warn("[notify] in-app insert failed", err instanceof Error ? err.message : err);
  }

  // 2. Email half — fan out per recipient. Skipped if globally disabled.
  if (!emailEnabled()) return;

  try {
    const [users, tenant] = await Promise.all([
      db.user.findMany({
        where: { id: { in: recipients } },
        select: { id: true, email: true, firstName: true },
      }),
      db.tenant.findUnique({
        where: { id: input.tenantId },
        select: { name: true },
      }),
    ]);

    const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3008";

    // Send in parallel — Resend handles its own rate limit; settle all so
    // one bad address doesn't block the rest.
    await Promise.allSettled(
      users
        .filter((u) => !!u.email)
        .map((u) =>
          sendEmail({
            to: u.email!,
            subject: input.title,
            template: NotificationEmail({
              title: input.title,
              body: input.body,
              href: input.href,
              recipientName: u.firstName ?? undefined,
              tenantName: tenant?.name ?? "QuikVC",
              appUrl,
            }),
          }),
        ),
    );
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.warn("[notify] email send failed", err instanceof Error ? err.message : err);
  }
}

/**
 * Convenience: notify all members of a tenant with a given role.
 * Use sparingly — fan-out cost grows with team size.
 */
export async function notifyRole(
  tenantId: string,
  role: string,
  payload: Omit<NotifyInput, "tenantId" | "userIds">,
): Promise<void> {
  const members = await db.membership.findMany({
    where: { tenantId, role },
    select: { userId: true },
  });
  await notify({
    tenantId,
    userIds: members.map((m) => m.userId),
    ...payload,
  });
}
