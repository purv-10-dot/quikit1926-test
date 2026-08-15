import { db } from "@/lib/db";

/**
 * Central place that turns an event (issue assigned, mentioned, etc.) into
 * in-app QtNotification rows. Called alongside — never instead of — the
 * existing email senders in lib/email/sendEmail.ts. Best-effort: failures are
 * logged, never thrown into the caller, since a broken notification row must
 * not block an email that already went out (or vice versa).
 */

/**
 * Per-user gate: QtUserNotificationSetting rows only exist once a user visits
 * the notification settings page or flips a toggle (see
 * app/api/notifications/settings/route.ts), so a missing row means "never
 * configured" — defaults to the schema default (inAppEnabled: true), not "off".
 */
async function isInAppEnabled(userId: string): Promise<boolean> {
  const pref = await db.qtUserNotificationSetting.findUnique({
    where: { userId },
    select: { inAppEnabled: true },
  });
  return pref?.inAppEnabled ?? true;
}

/**
 * Email counterpart of {@link isInAppEnabled}. Callers in lib/services/*.ts
 * and the issue/cron routes check this before invoking any lib/email/sendEmail.ts
 * template. The Prisma column defaults to `false`, but that default exists
 * only to seed a *newly created* row when a user flips the in-app toggle
 * first — it must never read as "emails off" for the far more common case of
 * a user who has never opened notification settings at all. So the read-side
 * fallback here is `true` (matches pre-existing behavior: everyone got every
 * email before this preference existed) — the row is opt-OUT, not opt-in.
 */
export async function isEmailEnabled(userId: string): Promise<boolean> {
  const pref = await db.qtUserNotificationSetting.findUnique({
    where: { userId },
    select: { emailInstantEnabled: true },
  });
  return pref?.emailInstantEnabled ?? true;
}

export interface NotifyDirectArgs {
  orgId: string;
  recipientId: string;
  actorId?: string | null;
  type: string;
  projectId?: string | null;
  issueId?: string | null;
  issueKey?: string | null;
  issueTitle?: string | null;
  commentId?: string | null;
  snippet?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  /** Set true when this event also sent an email — drives the "emailed" badge. */
  emailSent?: boolean;
}

/** Create a single "direct" notification row (recipient is the person the event is about). */
export async function notifyDirect(args: NotifyDirectArgs): Promise<void> {
  try {
    if (args.actorId && args.recipientId === args.actorId) return; // never notify yourself
    if (!(await isInAppEnabled(args.recipientId))) return;
    await db.qtNotification.create({
      data: {
        orgId: args.orgId,
        recipientId: args.recipientId,
        actorId: args.actorId ?? null,
        tab: "direct",
        type: args.type,
        projectId: args.projectId ?? null,
        issueId: args.issueId ?? null,
        issueKey: args.issueKey ?? null,
        issueTitle: args.issueTitle ?? null,
        commentId: args.commentId ?? null,
        snippet: args.snippet ?? null,
        fromValue: args.fromValue ?? null,
        toValue: args.toValue ?? null,
        emailSent: args.emailSent ?? false,
      },
    });
  } catch (e) {
    console.error("[notify] notifyDirect failed:", e instanceof Error ? e.message : e);
  }
}

export interface NotifyWatchersArgs {
  orgId: string;
  issueId: string;
  actorId?: string | null;
  type: string;
  projectId?: string | null;
  issueKey?: string | null;
  issueTitle?: string | null;
  commentId?: string | null;
  snippet?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  /** Recipients already notified via a "direct" row for this same event — skip them here to avoid a duplicate row. */
  skipRecipientIds?: string[];
}

/**
 * Fan out a "watching" notification row to every QtIssueWatcher on the issue,
 * excluding the actor and anyone already covered by a direct notification for
 * the same event (e.g. the assignee).
 */
export async function notifyWatchers(args: NotifyWatchersArgs): Promise<void> {
  try {
    const skip = new Set(args.skipRecipientIds ?? []);
    if (args.actorId) skip.add(args.actorId);

    const watchers = await db.qtIssueWatcher.findMany({
      where: { issueId: args.issueId },
      select: { userId: true },
    });
    const candidateIds = watchers.map((w) => w.userId).filter((id) => !skip.has(id));
    if (candidateIds.length === 0) return;

    const prefs = await db.qtUserNotificationSetting.findMany({
      where: { userId: { in: candidateIds } },
      select: { userId: true, inAppEnabled: true },
    });
    const disabled = new Set(prefs.filter((p) => !p.inAppEnabled).map((p) => p.userId));
    const recipientIds = candidateIds.filter((id) => !disabled.has(id));
    if (recipientIds.length === 0) return;

    await db.qtNotification.createMany({
      data: recipientIds.map((recipientId) => ({
        orgId: args.orgId,
        recipientId,
        actorId: args.actorId ?? null,
        tab: "watching",
        type: args.type,
        projectId: args.projectId ?? null,
        issueId: args.issueId,
        issueKey: args.issueKey ?? null,
        issueTitle: args.issueTitle ?? null,
        commentId: args.commentId ?? null,
        snippet: args.snippet ?? null,
        fromValue: args.fromValue ?? null,
        toValue: args.toValue ?? null,
      })),
    });
  } catch (e) {
    console.error("[notify] notifyWatchers failed:", e instanceof Error ? e.message : e);
  }
}
