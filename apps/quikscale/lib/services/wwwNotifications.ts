import { db } from "@/lib/db";
import { sendEmail, buildWWWAssignmentEmail, buildWWWUpdateEmail } from "./email";

export interface NotifyWWWAssignmentParams {
  orgId: string;
  itemId: string;
  what: string;
  when: Date | string;
  creatorUserId: string;
  /** Single assignee (legacy) — kept for back-compat; mapped to [ownerUserId]. */
  ownerUserId?: string;
  /** Full assignee list. When provided, takes precedence over ownerUserId. */
  ownerUserIds?: string[];
}

function formatWhen(when: Date | string): string {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return String(when);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Persist in-app Notification rows and dispatch an assignment email when a
 * WWW action item is created. Failures are logged + recorded but never thrown.
 */
export async function notifyWWWAssignment(params: NotifyWWWAssignmentParams): Promise<void> {
  const { orgId, itemId, what, when, creatorUserId, ownerUserId, ownerUserIds } = params;

  const recipientIds = Array.from(
    new Set(((ownerUserIds && ownerUserIds.length > 0) ? ownerUserIds : (ownerUserId ? [ownerUserId] : [])).filter(Boolean)),
  );
  if (recipientIds.length === 0) {
    console.log(`[notifyWWWAssignment] no recipients for itemId=${itemId}`);
    return;
  }
  console.log(`[notifyWWWAssignment] itemId=${itemId} recipients=${recipientIds.join(",")}`);

  const [creator, recipients] = await Promise.all([
    db.user.findUnique({
      where: { id: creatorUserId },
      select: { firstName: true, lastName: true, email: true },
    }),
    db.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  const creatorName = creator
    ? `${creator.firstName ?? ""} ${creator.lastName ?? ""}`.trim() || (creator.email ?? "A teammate")
    : "A teammate";

  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "";
  const itemUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/www?highlight=${itemId}` : undefined;

  const whenDate = formatWhen(when);
  const title = "A new action item has been assigned to you";
  const message = `${creatorName} assigned you "${what}" — due ${whenDate}.`;

  await db.notification.createMany({
    data: recipients.map(r => ({
      orgId,
      userId: r.id,
      title,
      message,
      type: "www_assigned",
      relatedEntityId: itemId,
      relatedEntityType: "WWWItem",
      channel: "in_app",
    })),
  });

  await Promise.all(
    recipients.map(async r => {
      if (!r.email) {
        console.warn(`[notifyWWWAssignment] user ${r.id} has no email — skipping send`);
        return;
      }
      const ownerName = `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.email;
      const { subject, html, text } = buildWWWAssignmentEmail({
        ownerName,
        what,
        whenDate,
        creatorName,
        itemUrl,
      });

      const result = await sendEmail({ to: r.email, subject, html, text });

      try {
        await db.notification.create({
          data: {
            orgId,
            userId: r.id,
            title,
            message: result.ok
              ? `Email sent to ${r.email}.`
              : `Email send failed: ${result.error ?? "unknown"}.`,
            type: result.ok ? "www_assigned_email_sent" : "www_assigned_email_failed",
            relatedEntityId: itemId,
            relatedEntityType: "WWWItem",
            channel: "email",
          },
        });
      } catch (err) {
        console.error("[notifyWWWAssignment] failed to log email outcome", err);
      }
    }),
  );
}

export interface NotifyWWWReassignmentParams {
  orgId: string;
  itemId: string;
  what: string;
  updaterUserId: string;
  oldOwnerIds: string[];
  newOwnerIds: string[];
}

/**
 * Send the "Your action item has been updated" email when the WWW assignee
 * list changes. Recipients are the union of (oldOwnerIds ∪ newOwnerIds), so
 * removed users learn they're off the item and new users learn they're on it.
 * Email body lists both the previous and new assignees.
 */
export async function notifyWWWReassignment(params: NotifyWWWReassignmentParams): Promise<void> {
  const { orgId, itemId, what, updaterUserId, oldOwnerIds, newOwnerIds } = params;

  const oldSet = new Set(oldOwnerIds.filter(Boolean));
  const newSet = new Set(newOwnerIds.filter(Boolean));
  if (oldSet.size === 0 && newSet.size === 0) return;

  // No-op when the lists are identical.
  const same =
    oldSet.size === newSet.size && [...oldSet].every(id => newSet.has(id));
  if (same) {
    console.log(`[notifyWWWReassignment] itemId=${itemId} no assignee change — skipping`);
    return;
  }

  const recipientIds = Array.from(new Set([...oldSet, ...newSet]));
  console.log(`[notifyWWWReassignment] itemId=${itemId} recipients=${recipientIds.join(",")} old=${[...oldSet].join(",")} new=${[...newSet].join(",")}`);

  const userIdsToFetch = Array.from(new Set([updaterUserId, ...recipientIds]));
  const allUsers = await db.user.findMany({
    where: { id: { in: userIdsToFetch } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const userMap = new Map(allUsers.map(u => [u.id, u]));

  const updater = userMap.get(updaterUserId);
  const updaterName = updater
    ? `${updater.firstName ?? ""} ${updater.lastName ?? ""}`.trim() || (updater.email ?? "A teammate")
    : "A teammate";

  const nameOf = (id: string): string => {
    const u = userMap.get(id);
    if (!u) return id;
    return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || (u.email ?? id);
  };
  const oldAssigneeNames = [...oldSet].map(nameOf);
  const newAssigneeNames = [...newSet].map(nameOf);

  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "";
  const itemUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/www?highlight=${itemId}` : undefined;

  const title = "Your action item has been updated";
  const message = `${updaterName} reassigned "${what}". Previous: ${oldAssigneeNames.join(", ") || "—"}. New: ${newAssigneeNames.join(", ") || "—"}.`;

  await db.notification.createMany({
    data: recipientIds.map(id => ({
      orgId,
      userId: id,
      title,
      message,
      type: "www_reassigned",
      relatedEntityId: itemId,
      relatedEntityType: "WWWItem",
      channel: "in_app",
    })),
  });

  await Promise.all(
    recipientIds.map(async (id) => {
      const r = userMap.get(id);
      if (!r) return;
      if (!r.email) {
        console.warn(`[notifyWWWReassignment] user ${r.id} has no email — skipping send`);
        return;
      }
      const recipientName = `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.email;
      const { subject, html, text } = buildWWWUpdateEmail({
        recipientName,
        what,
        updaterName,
        oldAssigneeNames,
        newAssigneeNames,
        itemUrl,
      });

      const result = await sendEmail({ to: r.email, subject, html, text });

      try {
        await db.notification.create({
          data: {
            orgId,
            userId: r.id,
            title,
            message: result.ok
              ? `Email sent to ${r.email}.`
              : `Email send failed: ${result.error ?? "unknown"}.`,
            type: result.ok ? "www_reassigned_email_sent" : "www_reassigned_email_failed",
            relatedEntityId: itemId,
            relatedEntityType: "WWWItem",
            channel: "email",
          },
        });
      } catch (err) {
        console.error("[notifyWWWReassignment] failed to log email outcome", err);
      }
    }),
  );
}
