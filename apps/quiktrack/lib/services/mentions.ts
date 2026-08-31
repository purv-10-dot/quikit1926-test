import { db } from "@/lib/db";
import { emailIssueMention, emailDocMention } from "@/lib/email/sendEmail";
import { notifyDirect, isEmailEnabled } from "@/lib/notifications/notify";

/**
 * Extract mentioned user ids from comment/description HTML. The editor's mention
 * node serializes to `<span data-mention-id="<userId>" …>@Name</span>`.
 */
export function extractMentionUserIds(html: string | null | undefined): string[] {
  if (!html) return [];
  const ids = new Set<string>();
  const re = /data-mention-id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) ids.add(m[1]);
  }
  return Array.from(ids);
}

/** Strip tags → trimmed, truncated plain-text excerpt for the email body. */
function toExcerpt(html: string, max = 160): string {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Email users newly mentioned in `html`. When `prevHtml` is supplied (e.g. a
 * description edit), only people who weren't already mentioned are notified.
 * The actor is never emailed for their own mention. Best-effort — never throws
 * into the caller (fire-and-forget with `void`).
 */
export async function notifyMentions(args: {
  orgId: string;
  actorUserId: string;
  issue: { id: string; key: string; title: string; projectId: string };
  context: "comment" | "description";
  html: string;
  prevHtml?: string | null;
}): Promise<void> {
  try {
    const current = new Set(extractMentionUserIds(args.html));
    if (current.size === 0) return;
    const previous = new Set(extractMentionUserIds(args.prevHtml));
    const targets = Array.from(current).filter(
      (id) => !previous.has(id) && id !== args.actorUserId,
    );
    if (targets.length === 0) return;

    const [users, project, actor, emailPrefs] = await Promise.all([
      // Resolve emails for the mentioned ids (they come from the project's
      // member list, so they're already valid org users).
      db.user.findMany({
        where: { id: { in: targets } },
        select: { id: true, email: true, firstName: true, lastName: true },
      }),
      db.qtProject.findUnique({ where: { id: args.issue.projectId }, select: { name: true } }),
      db.user.findUnique({
        where: { id: args.actorUserId },
        select: { firstName: true, lastName: true },
      }),
      db.qtUserNotificationSetting.findMany({
        where: { userId: { in: targets } },
        select: { userId: true, emailInstantEnabled: true },
      }),
    ]);
    // Missing row = never configured = emails on (see isEmailEnabled's doc comment).
    const emailDisabled = new Set(emailPrefs.filter((p) => !p.emailInstantEnabled).map((p) => p.userId));

    const actorName = actor
      ? [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() || null
      : null;
    const excerpt = toExcerpt(args.html);
    const issueRef = {
      id: args.issue.id,
      key: args.issue.key,
      title: args.issue.title,
      projectId: args.issue.projectId,
      projectName: project?.name ?? null,
      orgId: args.orgId,
    };

    await Promise.all(
      users.map(async (u) => {
        const emailSent = u.email && !emailDisabled.has(u.id)
          ? await emailIssueMention({
              to: u.email,
              recipientName:
                [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || null,
              issue: issueRef,
              mentionedBy: actorName,
              context: args.context,
              excerpt,
            })
              .then(() => true)
              .catch((e) => {
                console.error("[mentions] email failed:", e);
                return false;
              })
          : false;
        await notifyDirect({
          orgId: args.orgId,
          recipientId: u.id,
          actorId: args.actorUserId,
          type: "MENTION",
          projectId: issueRef.projectId,
          issueId: issueRef.id,
          issueKey: issueRef.key,
          issueTitle: issueRef.title,
          snippet: excerpt,
          emailSent,
        });
      }),
    );
  } catch (e) {
    console.error("[mentions] notifyMentions failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * Doc variant of {@link notifyMentions}. Emails users newly mentioned in a
 * document's body (diffed against the previous content so re-saves of an
 * auto-saving editor don't re-notify). Best-effort.
 */
export async function notifyDocMentions(args: {
  orgId: string;
  actorUserId: string;
  doc: { id: string; title: string; projectId: string };
  html: string;
  prevHtml?: string | null;
}): Promise<void> {
  try {
    const current = new Set(extractMentionUserIds(args.html));
    if (current.size === 0) return;
    const previous = new Set(extractMentionUserIds(args.prevHtml));
    const targets = Array.from(current).filter(
      (id) => !previous.has(id) && id !== args.actorUserId,
    );
    if (targets.length === 0) return;

    const [users, actor, emailPrefs] = await Promise.all([
      db.user.findMany({
        where: { id: { in: targets } },
        select: { id: true, email: true, firstName: true, lastName: true },
      }),
      db.user.findUnique({
        where: { id: args.actorUserId },
        select: { firstName: true, lastName: true },
      }),
      db.qtUserNotificationSetting.findMany({
        where: { userId: { in: targets } },
        select: { userId: true, emailInstantEnabled: true },
      }),
    ]);
    const emailDisabled = new Set(emailPrefs.filter((p) => !p.emailInstantEnabled).map((p) => p.userId));
    const actorName = actor
      ? [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() || null
      : null;
    const excerpt = toExcerpt(args.html);

    await Promise.all(
      users.map((u) =>
        u.email && !emailDisabled.has(u.id)
          ? emailDocMention({
              to: u.email,
              recipientName:
                [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || null,
              docTitle: args.doc.title,
              projectId: args.doc.projectId,
              docId: args.doc.id,
              mentionedBy: actorName,
              excerpt,
              orgId: args.orgId,
            }).catch((e) => console.error("[mentions] doc email failed:", e))
          : Promise.resolve(),
      ),
    );
  } catch (e) {
    console.error("[mentions] notifyDocMentions failed:", e instanceof Error ? e.message : e);
  }
}
