/**
 * Mail scan — polls connected Gmail/Outlook inboxes and enqueues a
 * `mail.email.received` event per new message. Runs on the scheduler tick
 * (~60s), mirroring date-scan. Kept BullMQ-free so it's unit-testable.
 *
 * The per-connection poll watermark ("cursor") lives in Redis (not a DB column)
 * — a lightweight, ephemeral value; on a cold cache the provider seeds it to
 * "now" so QuikFlow never backfills an entire mailbox.
 *
 * Idempotency: dedupeKey = `mail:<connectionId>:<messageId>`, so a message that
 * reappears in an overlapping poll window collapses to a single run.
 */
import { db } from "@/lib/db";
import { enqueueEvent, getRedis } from "@/lib/queue/queue";
import { getFreshAccessToken, getMailProvider, MAIL_PROVIDER_IDS } from "@/lib/connectors";
import { MAIL_APP_SLUG, MAIL_EVENT_ID } from "@/lib/catalog/mail";

const CURSOR_PREFIX = "mail:cursor:";

/** Orgs with at least one Active workflow triggering on a received email. */
async function orgsWithMailWorkflows(): Promise<Set<string>> {
  const workflows = await db.wfWorkflow.findMany({
    where: { status: "Active", deletedAt: null },
    select: { orgId: true, trigger: true },
  });
  const orgs = new Set<string>();
  for (const wf of workflows) {
    const t = (wf.trigger ?? {}) as Record<string, unknown>;
    if (t.app === MAIL_APP_SLUG && t.event === MAIL_EVENT_ID) orgs.add(wf.orgId);
  }
  return orgs;
}

export async function runMailScan(): Promise<{ fired: number }> {
  const orgs = await orgsWithMailWorkflows();
  if (orgs.size === 0) return { fired: 0 };

  const conns = await db.wfConnection.findMany({
    where: {
      orgId: { in: [...orgs] },
      status: "connected",
      provider: { in: MAIL_PROVIDER_IDS },
    },
    select: {
      id: true,
      orgId: true,
      provider: true,
      label: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
    },
  });

  const redis = getRedis();
  let fired = 0;

  for (const conn of conns) {
    const provider = getMailProvider(conn.provider);
    if (!provider) continue;

    const cursorKey = `${CURSOR_PREFIX}${conn.id}`;
    let accessToken: string;
    try {
      accessToken = await getFreshAccessToken(conn);
    } catch {
      // Token refresh failed (revoked / reconnect needed) — skip this mailbox.
      continue;
    }

    const cursor = await redis.get(cursorKey);
    let result: Awaited<ReturnType<typeof provider.listSince>>;
    try {
      result = await provider.listSince(accessToken, cursor);
    } catch {
      continue;
    }

    for (const m of result.messages) {
      try {
        await enqueueEvent({
          app: MAIL_APP_SLUG,
          event: MAIL_EVENT_ID,
          orgId: conn.orgId,
          dedupeKey: `mail:${conn.id}:${m.messageId}`,
          data: {
            provider: conn.provider,
            mailbox: conn.label,
            from: m.from,
            fromName: m.fromName,
            to: m.to,
            cc: m.cc,
            subject: m.subject,
            snippet: m.snippet,
            messageId: m.messageId,
            threadId: m.threadId,
            receivedAt: m.receivedAt,
            hasAttachments: m.hasAttachments,
          },
          occurredAt: m.receivedAt,
        });
        fired += 1;
      } catch {
        // A single bad enqueue shouldn't abort the whole scan.
      }
    }

    if (result.nextCursor && result.nextCursor !== cursor) {
      await redis.set(cursorKey, result.nextCursor);
    }
  }

  return { fired };
}
