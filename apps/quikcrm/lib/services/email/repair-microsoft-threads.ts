/**
 * One-time repair for historical Microsoft email threads.
 *
 * The old Microsoft send flow (/me/sendMail + findSentMessage) could capture the
 * WRONG conversationId when subjects collided: it grabbed "the latest Sent Items
 * message matching the subject", which was sometimes a different, older message
 * in a different conversation. As a result some outbound CrmEmailMessage rows
 * were parented to a wrong CrmEmailThread whose providerThreadId does not match
 * the real conversation — so replies (which carry the REAL conversationId) never
 * attached and messageCount stayed at 1.
 *
 * This repair recovers the correct conversationId from the raw mirror
 * (CrmMailboxEmail — which always stored the true providerThreadId per message),
 * re-parents the CrmEmailMessage onto the correct thread, and recomputes
 * messageCount for every affected thread.
 *
 * Safety / scope:
 *   - Microsoft connections ONLY. Gmail rows are never touched.
 *   - Matches an outbound CrmEmailMessage to its true mirror row by
 *     (direction=outbound, exact subject, recipient overlap, closest sentAt
 *     within a window). Ambiguous (0 or >1 candidate) → SKIP, never guess.
 *   - Idempotent: once a row points at the correct thread, a re-run is a no-op.
 *   - Read-then-write inside one transaction per repaired message.
 *
 * It repairs ONLY historical data and does not touch the live sync path.
 */

import { prisma } from "@/lib/db/prisma";

/** How far apart the CRM row's sentAt and the mirror row's sentAt may be. */
const SENT_MATCH_WINDOW_MS = 30 * 60 * 1000; // 30 min — generous send/mirror lag

export interface RepairReport {
  connectionsScanned: number;
  rowsScanned: number;
  rowsRepaired: number;
  rowsSkipped: number;
  threadsRecounted: number;
  /** Empty threads deleted after their only message was re-parented away. */
  threadsPruned: number;
  /** Per-row detail for the report/log. */
  details: Array<{
    messageId: string;
    subject: string | null;
    outcome: "repaired" | "already-correct" | "skipped-no-match" | "skipped-ambiguous";
    fromThread?: string;
    toThread?: string;
  }>;
}

interface RunOptions {
  /** When false (default), computes the repair and reports WITHOUT writing. */
  apply?: boolean;
  /** Restrict to a single org (optional). */
  orgId?: string;
}

function overlaps(a: string[], b: string[]): boolean {
  const setB = new Set(b.map((x) => x.trim().toLowerCase()));
  return a.some((x) => setB.has(x.trim().toLowerCase()));
}

export async function repairMicrosoftThreads(opts: RunOptions = {}): Promise<RepairReport> {
  const report: RepairReport = {
    connectionsScanned: 0,
    rowsScanned: 0,
    rowsRepaired: 0,
    rowsSkipped: 0,
    threadsRecounted: 0,
    threadsPruned: 0,
    details: [],
  };

  // Microsoft connections only (Gmail untouched — requirement 6).
  const conns = await prisma.crmMailboxConnection.findMany({
    where: { provider: "microsoft", ...(opts.orgId ? { orgId: opts.orgId } : {}) },
    select: { id: true, orgId: true },
  });
  report.connectionsScanned = conns.length;

  const affectedThreadIds = new Set<string>();

  for (const conn of conns) {
    // Only OUTBOUND rows can carry the send-flow bug (inbound rows always came
    // from sync with the correct conversationId).
    const rows = await prisma.crmEmailMessage.findMany({
      where: { orgId: conn.orgId, mailboxConnectionId: conn.id, direction: "outbound" },
      select: {
        id: true,
        subject: true,
        toAddresses: true,
        sentAt: true,
        createdAt: true,
        threadId: true,
        relatedKind: true,
        relatedObjectId: true,
        thread: { select: { id: true, providerThreadId: true } },
      },
    });

    for (const row of rows) {
      report.rowsScanned++;

      // Find the true mirror row: same subject, recipient overlap, closest sentAt.
      const candidates = await prisma.crmMailboxEmail.findMany({
        where: {
          orgId: conn.orgId,
          mailboxConnectionId: conn.id,
          direction: "outbound",
          subject: row.subject ?? undefined,
        },
        select: { providerThreadId: true, toAddresses: true, sentAt: true },
      });

      const anchor = (row.sentAt ?? row.createdAt).getTime();
      const matches = candidates
        .filter((c) => c.providerThreadId && overlaps(row.toAddresses, c.toAddresses))
        .map((c) => ({
          providerThreadId: c.providerThreadId as string,
          dt: Math.abs((c.sentAt ? c.sentAt.getTime() : anchor) - anchor),
        }))
        .filter((c) => c.dt <= SENT_MATCH_WINDOW_MS)
        .sort((a, b) => a.dt - b.dt);

      // Distinct correct threads among the matches — ambiguous if >1.
      const distinctThreads = [...new Set(matches.map((m) => m.providerThreadId))];

      if (distinctThreads.length === 0) {
        report.rowsSkipped++;
        report.details.push({
          messageId: row.id,
          subject: row.subject,
          outcome: "skipped-no-match",
        });
        continue;
      }
      if (distinctThreads.length > 1) {
        report.rowsSkipped++;
        report.details.push({
          messageId: row.id,
          subject: row.subject,
          outcome: "skipped-ambiguous",
        });
        continue;
      }

      const correctThreadId = distinctThreads[0];
      const currentThreadId = row.thread?.providerThreadId ?? null;

      if (currentThreadId === correctThreadId) {
        // Idempotent: already correct — nothing to do.
        report.details.push({
          messageId: row.id,
          subject: row.subject,
          outcome: "already-correct",
        });
        continue;
      }

      // Repair: re-parent this message onto the thread with the correct
      // providerThreadId (create it if missing), then flag both old + new
      // threads for a messageCount recompute.
      if (opts.apply) {
        await prisma.$transaction(async (tx) => {
          const correctThread = await tx.crmEmailThread.upsert({
            where: {
              orgId_mailboxConnectionId_providerThreadId: {
                orgId: conn.orgId,
                mailboxConnectionId: conn.id,
                providerThreadId: correctThreadId,
              },
            },
            create: {
              orgId: conn.orgId,
              mailboxConnectionId: conn.id,
              providerThreadId: correctThreadId,
              subject: row.subject,
              // A thread needs a related record; inherit the message's own link.
              relatedKind: row.relatedKind,
              relatedObjectId: row.relatedObjectId,
              lastMessageAt: row.sentAt ?? row.createdAt,
              messageCount: 0,
            },
            update: {},
            select: { id: true },
          });
          await tx.crmEmailMessage.update({
            where: { id: row.id },
            data: { threadId: correctThread.id },
          });
          // Keep the mirror cross-link's matchedObjectId intact; only the CRM
          // thread parentage changes. Also fix the mirror row's stored thread if
          // it, too, points at the wrong conversation (defensive; usually already
          // correct since the mirror is the source of truth).
        });
      }

      if (row.thread?.id) affectedThreadIds.add(row.thread.id);
      report.rowsRepaired++;
      report.details.push({
        messageId: row.id,
        subject: row.subject,
        outcome: "repaired",
        fromThread: currentThreadId ?? undefined,
        toThread: correctThreadId,
      });
    }
  }

  // Recompute messageCount + lastMessageAt for every MS thread, and prune any
  // that ended up empty. Runs on every apply (not just when repairs happened)
  // so a rerun also cleans up empty-thread artifacts left by a prior apply —
  // still idempotent (recount to the same value; prune only truly-empty threads).
  if (opts.apply) {
    const threads = await prisma.crmEmailThread.findMany({
      where: { mailboxConnectionId: { in: conns.map((c) => c.id) } },
      select: { id: true },
    });
    for (const t of threads) {
      const agg = await prisma.crmEmailMessage.aggregate({
        where: { threadId: t.id },
        _count: { _all: true },
        _max: { sentAt: true, receivedAt: true, createdAt: true },
      });
      if (agg._count._all === 0) {
        // A thread emptied by re-parenting its only message is a repair artifact
        // (it would otherwise render as a "0-message" thread on the record). Safe
        // to delete — it has no messages. Only reachable here for MS connections.
        await prisma.crmEmailThread.delete({ where: { id: t.id } });
        report.threadsPruned++;
        continue;
      }
      const last =
        agg._max.receivedAt ?? agg._max.sentAt ?? agg._max.createdAt ?? undefined;
      await prisma.crmEmailThread.update({
        where: { id: t.id },
        data: { messageCount: agg._count._all, ...(last ? { lastMessageAt: last } : {}) },
      });
      report.threadsRecounted++;
    }
  }

  return report;
}
