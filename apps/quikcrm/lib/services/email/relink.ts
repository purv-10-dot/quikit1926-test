/**
 * Retroactive email → record linking.
 *
 * Emails sent with Link-to-Record = None (e.g. Log Activity → Email, standalone)
 * are stored standalone: CrmEmailThread/CrmEmailMessage parented to
 * relatedKind:"None"/relatedObjectId:"standalone", the timeline CrmActivity
 * standalone, and the CrmMailboxEmail mirror row unmatched. Ingest-time matching
 * (send + sync) never revisits them, so an email sent BEFORE a Lead existed
 * never attaches to that Lead.
 *
 * When a record (currently Lead) is created or its email changes, this re-parents
 * the standalone artifacts of every mailbox email whose participants include the
 * record's email — in place, preserving threading, dedupe-safe, idempotent.
 *
 * Idempotent + safe: every write is guarded on relatedKind:"None" (and the mirror
 * scan excludes rows already matched to a real record), so a rerun links nothing
 * new and an email already linked to another record is never stolen.
 *
 * Does NOT touch the sending pipeline or the mailbox sync — additive only.
 */

import { prisma } from "@/lib/db/prisma";
import { STANDALONE_KIND, STANDALONE_RELATED_ID } from "@/lib/services/activities/target-existence";
import { normalizeEmails } from "@/lib/services/email/record-emails";

export type RelinkKind = "Lead" | "Contact" | "Account" | "Opportunity";

export interface RelinkResult {
  threadsRelinked: number;
  messagesRelinked: number;
  activitiesRelinked: number;
  mirrorRowsLinked: number;
}

const EMPTY: RelinkResult = {
  threadsRelinked: 0,
  messagesRelinked: 0,
  activitiesRelinked: 0,
  mirrorRowsLinked: 0,
};

export async function relinkStandaloneEmailsForRecord(args: {
  orgId: string;
  kind: RelinkKind;
  recordId: string;
  emails: Array<string | null | undefined>;
}): Promise<RelinkResult> {
  const emails = normalizeEmails(args.emails);
  if (emails.length === 0) return { ...EMPTY };

  // 1. Standalone mirror rows whose participants include one of the emails.
  //    Exclude rows already matched to a real record (idempotency + no stealing).
  const candidates = await prisma.crmMailboxEmail.findMany({
    where: {
      orgId: args.orgId,
      OR: [
        { matchedObjectId: null },
        { matchedObjectId: STANDALONE_RELATED_ID },
        { matchedKind: STANDALONE_KIND },
        { matchedKind: null },
      ],
      AND: [
        {
          OR: [
            { fromAddress: { in: emails } },
            { toAddresses: { hasSome: emails } },
            { ccAddresses: { hasSome: emails } },
          ],
        },
      ],
    },
    select: { id: true, providerThreadId: true },
  });
  if (candidates.length === 0) return { ...EMPTY };

  const candidateIds = candidates.map((c) => c.id);
  const providerThreadIds = [
    ...new Set(candidates.map((c) => c.providerThreadId).filter((t): t is string => !!t)),
  ];

  return prisma.$transaction(async (tx) => {
    // 2. Resolve the CRM threads for those providerThreadIds that are STILL
    //    standalone (relatedKind "None"). These are the ones to re-parent.
    const threads =
      providerThreadIds.length > 0
        ? await tx.crmEmailThread.findMany({
            where: {
              orgId: args.orgId,
              providerThreadId: { in: providerThreadIds },
              relatedKind: STANDALONE_KIND,
            },
            select: { id: true },
          })
        : [];
    const threadIds = threads.map((t) => t.id);

    // 3. The standalone messages in those threads — capture their activityIds
    //    before re-parenting (so we can move their timeline activities too).
    const messages =
      threadIds.length > 0
        ? await tx.crmEmailMessage.findMany({
            where: { orgId: args.orgId, threadId: { in: threadIds }, relatedKind: STANDALONE_KIND },
            select: { id: true, activityId: true },
          })
        : [];
    const activityIds = messages
      .map((m) => m.activityId)
      .filter((id): id is string => !!id);

    // 4. Re-parent thread → record.
    const threadRes =
      threadIds.length > 0
        ? await tx.crmEmailThread.updateMany({
            where: { orgId: args.orgId, id: { in: threadIds }, relatedKind: STANDALONE_KIND },
            data: { relatedKind: args.kind, relatedObjectId: args.recordId },
          })
        : { count: 0 };

    // 5. Re-parent the messages in those threads.
    const msgRes =
      threadIds.length > 0
        ? await tx.crmEmailMessage.updateMany({
            where: { orgId: args.orgId, threadId: { in: threadIds }, relatedKind: STANDALONE_KIND },
            data: { relatedKind: args.kind, relatedObjectId: args.recordId },
          })
        : { count: 0 };

    // 6. Move the timeline activities onto the record (Lead sets leadId too, so
    //    it surfaces on the Lead timeline exactly like a natively-linked email).
    const actRes =
      activityIds.length > 0
        ? await tx.crmActivity.updateMany({
            where: { orgId: args.orgId, id: { in: activityIds }, relatedKind: STANDALONE_KIND },
            data: {
              relatedKind: args.kind,
              relatedObjectId: args.recordId,
              ...(args.kind === "Lead" ? { leadId: args.recordId } : {}),
              ...(args.kind === "Opportunity" ? { opportunityId: args.recordId } : {}),
            },
          })
        : { count: 0 };

    // 7. Cross-link the mirror rows (keeps the Mailbox module + Account/Opp
    //    roll-up consistent). Safe to set on all candidates — they were unmatched.
    const mirrorRes = await tx.crmMailboxEmail.updateMany({
      where: { orgId: args.orgId, id: { in: candidateIds } },
      data: { matchedKind: args.kind, matchedObjectId: args.recordId },
    });

    return {
      threadsRelinked: threadRes.count,
      messagesRelinked: msgRes.count,
      activitiesRelinked: actRes.count,
      mirrorRowsLinked: mirrorRes.count,
    };
  });
}

// ─── One-time backfill ────────────────────────────────────────────────────────

export interface BackfillReport {
  leadsScanned: number;
  leadsWithLinks: number;
  threadsRelinked: number;
  messagesRelinked: number;
  activitiesRelinked: number;
  mailboxRowsLinked: number;
  errors: number;
}

/**
 * One-time backfill: run the retroactive re-link for EVERY existing Lead, so
 * standalone emails that predate the create/update hook get attached. Reuses
 * `relinkStandaloneEmailsForRecord` per lead (no duplicated logic) and is fully
 * idempotent (already-linked emails are excluded), so it is safe to rerun.
 *
 * Dry-run (default) computes nothing destructive: it calls the re-link with
 * `apply:false` semantics by simply NOT invoking it — instead it counts the
 * candidate matches per lead. `apply:true` performs the real re-link.
 */
export async function backfillRelinkAllLeads(opts: {
  apply?: boolean;
  orgId?: string;
  /** Process leads in batches to bound memory on large orgs. */
  batchSize?: number;
}): Promise<BackfillReport> {
  const report: BackfillReport = {
    leadsScanned: 0,
    leadsWithLinks: 0,
    threadsRelinked: 0,
    messagesRelinked: 0,
    activitiesRelinked: 0,
    mailboxRowsLinked: 0,
    errors: 0,
  };
  const batchSize = opts.batchSize ?? 500;
  let cursor: string | undefined;

  for (;;) {
    const leads = await prisma.crmLead.findMany({
      where: {
        ...(opts.orgId ? { orgId: opts.orgId } : {}),
        // Only leads that actually have an email to match on.
        OR: [{ email: { not: null } }, { secondaryEmail: { not: null } }],
      },
      select: { id: true, orgId: true, email: true, secondaryEmail: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (leads.length === 0) break;

    for (const lead of leads) {
      report.leadsScanned++;
      try {
        if (opts.apply) {
          const r = await relinkStandaloneEmailsForRecord({
            orgId: lead.orgId,
            kind: "Lead",
            recordId: lead.id,
            emails: [lead.email, lead.secondaryEmail],
          });
          if (r.threadsRelinked + r.mirrorRowsLinked > 0) report.leadsWithLinks++;
          report.threadsRelinked += r.threadsRelinked;
          report.messagesRelinked += r.messagesRelinked;
          report.activitiesRelinked += r.activitiesRelinked;
          report.mailboxRowsLinked += r.mirrorRowsLinked;
        } else {
          // Dry-run: count standalone mirror rows that WOULD match, no writes.
          const emails = normalizeEmails([lead.email, lead.secondaryEmail]);
          if (emails.length === 0) continue;
          const would = await prisma.crmMailboxEmail.count({
            where: {
              orgId: lead.orgId,
              OR: [
                { matchedObjectId: null },
                { matchedObjectId: STANDALONE_RELATED_ID },
                { matchedKind: STANDALONE_KIND },
                { matchedKind: null },
              ],
              AND: [
                {
                  OR: [
                    { fromAddress: { in: emails } },
                    { toAddresses: { hasSome: emails } },
                    { ccAddresses: { hasSome: emails } },
                  ],
                },
              ],
            },
          });
          if (would > 0) {
            report.leadsWithLinks++;
            report.mailboxRowsLinked += would;
          }
        }
      } catch (err) {
        report.errors++;
        console.error(
          `[email:relink:backfill] lead ${lead.id} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    cursor = leads[leads.length - 1].id;
    if (leads.length < batchSize) break;
  }

  return report;
}
