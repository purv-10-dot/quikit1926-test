/**
 * Email sync poller with a per-connection state machine:
 *
 *   initial  → set the backfill window, transition to backfilling.
 *   backfilling → import history (Inbox + Sent) page-by-page across cron ticks;
 *                 when exhausted, seed the incremental cursors and go live.
 *   live     → incremental fetch (Gmail history / MS per-folder delta), notify
 *                 on new inbound replies.
 *
 *   syncMailbox(conn)  — advance ONE mailbox by one tick of its state machine.
 *   runEmailSync()     — cross-org sweep, guarded by a Postgres advisory lock so
 *                        overlapping Vercel cron invocations don't double-process.
 *
 * Reuse: persistMessage() (shared write+dedupe path), matchRecordByAnyAddress()
 * (indexed Lead/Contact lookup + Account/Opportunity roll-up), createNotification(),
 * withFreshToken() (token refresh in one place).
 *
 * Scope: messages whose counterparty matches an existing CRM record are stored
 * against that record. Unmatched OUTBOUND mail (sent by the user from Outlook/
 * Gmail to a non-CRM address) is still persisted as a STANDALONE activity so
 * every email the user sends appears in Activities. Unmatched INBOUND mail is
 * skipped — mirror-only. Historical backfill imports mail sent/received directly
 * in Outlook/Gmail (req 2/3), regardless of whether it ever touched the CRM.
 */

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { getProvider } from "./providers";
import { withFreshToken } from "./mailbox";
import { persistMessage } from "./persist";
import { upsertMailboxEmail, linkMailboxEmailToCrm } from "./mailbox-store";
import { matchRecordByAnyAddress } from "./record-emails";
import { STANDALONE_KIND, STANDALONE_RELATED_ID } from "@/lib/services/activities/target-existence";
import { createNotification } from "@/lib/notifications/service";
import type { CrmMailboxConnection } from "@quikit/database";
import type { NormalizedMessage } from "./providers/types";

/** Advisory-lock key (arbitrary constant) for the cross-org sweep. */
const SYNC_LOCK_KEY = 776_1042; // "email sync" — any stable 32-bit int

/** Per-tick wall-clock budget for the backfill loop (keeps under the 300s cron). */
const BACKFILL_TICK_BUDGET_MS = 60_000;
/** Hard cap on pages per tick — a defensive bound so a fast/misbehaving provider
 *  can't spin the loop unbounded; the remainder resumes next tick. */
const BACKFILL_MAX_PAGES_PER_TICK = 50;

export interface MailboxSyncResult {
  connectionId: string;
  emailAddress: string;
  phase: string; // "backfilling" | "live"
  fetched: number;
  mirrored: number; // NEW mailbox-mirror rows stored (P3: every email)
  matched: number; // CRM-record matches
  standalone: number; // unmatched OUTBOUND — persisted as standalone activities
  created: number; // NEW CRM-matched activities/messages
  skipped: number; // fetched but not CRM-matched (still mirrored)
  backfillDone?: boolean;
  error?: string;
}

function backfillSinceMs(conn: CrmMailboxConnection): number {
  if (conn.backfillSince) return conn.backfillSince.getTime();
  return Date.now() - env().MAILBOX_BACKFILL_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Persist a batch of fetched messages: match → persist (dedupe) → optionally
 * notify. Returns per-batch counters. `notify` is false during backfill so
 * historical mail doesn't spam the notification bell.
 */
async function ingestBatch(
  conn: CrmMailboxConnection,
  messages: NormalizedMessage[],
  result: MailboxSyncResult,
  notify: boolean,
): Promise<void> {
  for (const msg of messages) {
    // ── (1) Mailbox mirror: store EVERY email (P3), dedupe-safe. ──────────────
    const mirror = await upsertMailboxEmail(conn, msg);
    if (mirror.created) result.mirrored++;

    // ── (2) CRM-matched path (P1/P2): unchanged. Drafts have no counterparty
    //        to attach to, so they never enter the CRM record view. ───────────
    if (msg.folder === "drafts") continue;

    const allAddrs = [msg.fromAddress, ...msg.toAddresses, ...msg.ccAddresses];
    const match = await matchRecordByAnyAddress(conn.orgId, allAddrs, conn.emailAddress);
    if (match) {
      result.matched++;
    } else if (msg.direction === "outbound") {
      // Mail the user SENT from Outlook/Gmail to an address with no CRM record.
      // It still becomes a standalone timeline activity (relatedKind "None") so
      // outbound work is never invisible in Activities — parity with sending
      // from QuikCRM with Link-to-Record = None. Unmatched INBOUND stays
      // mirror-only: it is unsolicited mail, not user activity.
      result.standalone++;
    } else {
      result.skipped++;
      continue;
    }

    const persisted = await persistMessage({
      orgId: conn.orgId,
      mailboxConnectionId: conn.id,
      userId: conn.userId,
      provider: conn.provider,
      providerMessageId: msg.providerMessageId,
      providerThreadId: msg.providerThreadId,
      rfcMessageId: msg.rfcMessageId,
      inReplyTo: msg.inReplyTo,
      direction: msg.direction,
      fromAddress: msg.fromAddress,
      toAddresses: msg.toAddresses,
      ccAddresses: msg.ccAddresses,
      subject: msg.subject,
      snippet: msg.snippet,
      bodyHtml: msg.bodyHtml,
      bodyText: msg.bodyText,
      timestamp: msg.timestamp,
      relatedKind: match?.kind ?? STANDALONE_KIND,
      relatedObjectId: match?.id ?? STANDALONE_RELATED_ID,
      opportunityId: match?.opportunityId ?? undefined,
      attachments: msg.attachments.map((a) => ({
        providerAttachmentId: a.providerAttachmentId,
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
      })),
    });

    // Cross-link the mirror row to its CRM-matched counterpart. Standalone
    // messages have no record to point at, so matchedKind/matchedObjectId stay null.
    if (match) {
      await linkMailboxEmailToCrm(mirror.id, persisted.messageId, match.kind, match.id);
    }

    if (persisted.created) {
      result.created++;
      if (notify && match && msg.direction === "inbound") {
        await notifyReply(conn, msg.fromAddress, msg.subject, match).catch(() => {});
      }
    }
  }
}

/** Advance one mailbox by one tick. Never throws — errors captured on result + row. */
export async function syncMailbox(conn: CrmMailboxConnection): Promise<MailboxSyncResult> {
  const result: MailboxSyncResult = {
    connectionId: conn.id,
    emailAddress: conn.emailAddress,
    phase: conn.syncState,
    fetched: 0,
    mirrored: 0,
    matched: 0,
    standalone: 0,
    created: 0,
    skipped: 0,
  };

  try {
    const provider = getProvider(conn.provider);

    // initial → begin the historical backfill window.
    if (conn.syncState === "initial") {
      const since = new Date(Date.now() - env().MAILBOX_BACKFILL_DAYS * 24 * 60 * 60 * 1000);
      await prisma.crmMailboxConnection.update({
        where: { id: conn.id },
        data: { syncState: "backfilling", backfillSince: since, backfillCursor: null },
      });
      conn = { ...conn, syncState: "backfilling", backfillSince: since, backfillCursor: null };
      result.phase = "backfilling";
    }

    if (conn.syncState === "backfilling") {
      await runBackfillTick(conn, provider, result);
    } else {
      await runLiveTick(conn, provider, result);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync failed";
    result.error = message;
    await prisma.crmMailboxConnection
      .update({ where: { id: conn.id }, data: { lastError: message.slice(0, 500) } })
      .catch(() => {});
    console.error(`[email:sync] mailbox ${conn.id} (${conn.emailAddress}) failed:`, message);
  }

  return result;
}

/** One backfill tick: page until the time budget, persist matches, maybe finish. */
async function runBackfillTick(
  conn: CrmMailboxConnection,
  provider: ReturnType<typeof getProvider>,
  result: MailboxSyncResult,
): Promise<void> {
  const sinceMs = backfillSinceMs(conn);
  const deadline = Date.now() + BACKFILL_TICK_BUDGET_MS;
  let cursor = conn.backfillCursor;
  let done = false;
  let pages = 0;
  let seedHistoryId: string | undefined;
  let seedDeltaInbox: string | undefined;
  let seedDeltaSent: string | undefined;
  let seedDeltaDrafts: string | undefined;

  do {
    pages++;
    const page = await withFreshToken(conn, (ctx) =>
      provider.backfillMessages(ctx, { sinceMs, cursor }),
    );
    result.fetched += page.messages.length;
    // Historical import: do NOT notify (req: no bell spam for old mail).
    await ingestBatch(conn, page.messages, result, false);
    cursor = page.nextCursor ?? null;
    done = page.done;
    if (done) {
      seedHistoryId = page.historyId;
      seedDeltaInbox = page.deltaInbox;
      seedDeltaSent = page.deltaSent;
      seedDeltaDrafts = page.deltaDrafts;
    }
    // Persist progress each page so a crash/timeout resumes here next tick.
    await prisma.crmMailboxConnection.update({
      where: { id: conn.id },
      data: { backfillCursor: cursor, lastSyncedAt: new Date(), status: "active", lastError: null },
    });
  } while (!done && Date.now() < deadline && pages < BACKFILL_MAX_PAGES_PER_TICK);

  if (done) {
    await prisma.crmMailboxConnection.update({
      where: { id: conn.id },
      data: {
        syncState: "live",
        backfillCursor: null,
        historyId: seedHistoryId ?? conn.historyId,
        deltaInbox: seedDeltaInbox ?? conn.deltaInbox,
        deltaSent: seedDeltaSent ?? conn.deltaSent,
        deltaDrafts: seedDeltaDrafts ?? conn.deltaDrafts,
        lastSyncedAt: new Date(),
      },
    });
    result.backfillDone = true;
    result.phase = "live";
  }
}

/** One live tick: incremental fetch + notify on new inbound. */
async function runLiveTick(
  conn: CrmMailboxConnection,
  provider: ReturnType<typeof getProvider>,
  result: MailboxSyncResult,
): Promise<void> {
  const sync = await withFreshToken(conn, (ctx) =>
    provider.fetchNewMessages(ctx, { backfillSinceMs: backfillSinceMs(conn) }),
  );
  result.fetched = sync.messages.length;
  await ingestBatch(conn, sync.messages, result, true);

  await prisma.crmMailboxConnection.update({
    where: { id: conn.id },
    data: {
      historyId: sync.historyId ?? conn.historyId,
      deltaInbox: sync.deltaInbox ?? conn.deltaInbox,
      deltaSent: sync.deltaSent ?? conn.deltaSent,
      deltaDrafts: sync.deltaDrafts ?? conn.deltaDrafts,
      deltaLink: sync.deltaLink ?? conn.deltaLink,
      lastSyncedAt: new Date(),
      status: "active",
      lastError: null,
    },
  });
}

async function notifyReply(
  conn: CrmMailboxConnection,
  fromAddress: string,
  subject: string,
  match: { kind: string; id: string },
): Promise<void> {
  const link =
    match.kind === "Lead"
      ? `/leads/${match.id}`
      : match.kind === "Contact"
        ? `/contacts/${match.id}`
        : match.kind === "Account"
          ? `/accounts/${match.id}`
          : `/opportunities/${match.id}`;

  await createNotification({
    orgId: conn.orgId,
    userId: conn.userId,
    type: "email_received",
    category: "system",
    title: "New email reply",
    body: `${fromAddress} replied: ${subject || "(no subject)"}`,
    link,
    metadata: { relatedKind: match.kind, relatedObjectId: match.id, fromAddress },
    // The reply is from the customer, not the user — email them the heads-up.
    skipEmail: false,
  });
}

/**
 * Cross-org sweep of every active mailbox. Guarded by a Postgres advisory lock:
 * if another instance already holds it, this invocation returns immediately
 * (no double-sync). Uses the app's own DB — no Redis dependency required.
 */
export async function runEmailSync(): Promise<{
  ranSweep: boolean;
  mailboxes: number;
  results: MailboxSyncResult[];
}> {
  // pg_try_advisory_lock returns false immediately if the lock is held.
  const lockRows = await prisma.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${SYNC_LOCK_KEY}) AS locked
  `;
  const locked = lockRows[0]?.locked === true;
  if (!locked) {
    return { ranSweep: false, mailboxes: 0, results: [] };
  }

  try {
    const connections = await prisma.crmMailboxConnection.findMany({
      where: { status: "active" },
    });
    const results: MailboxSyncResult[] = [];
    for (const conn of connections) {
      results.push(await syncMailbox(conn));
    }
    return { ranSweep: true, mailboxes: connections.length, results };
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${SYNC_LOCK_KEY})`.catch(() => {});
  }
}
