/**
 * Leadership-digest DETAIL assembly (per-user activity records).
 *
 * The redesigned digest replaces the old count-only summary tables with a
 * detailed, per-CRM-user breakdown: for every rep in the recipient's tier scope
 * we surface the ACTUAL records they logged in the window — calls, emails,
 * meetings, and completed tasks — not just totals.
 *
 * ─── Scope ───────────────────────────────────────────────────────────────────
 * Reuses the SAME tier model as the rest of the digest / dashboard:
 *   - Administrator → org-wide (all reps)
 *   - SalesManager  → managed team members (resolveManagerTeam), own-only fallback
 *   - SalesUser / others → self only
 * orgId is ALWAYS filtered (tenant isolation, per app rules).
 *
 * ─── Data provenance (see digest-detail findings) ─────────────────────────────
 *   Calls    : CrmActivity type="Call" → linkedCallLogId → CrmCallLog
 *              (durationSec, dispositionName, notes). Contact/Company from the
 *              related Lead (relatedKind="Lead").
 *   Emails   : CrmEmailMessage direction="outbound". Delivery status is NOT
 *              tracked in the model → we honestly report "Sent" (recorded), never
 *              a fabricated "Delivered". Reply status is DERIVED: an inbound
 *              message in the same thread after the outbound sentAt.
 *   Meetings : CrmOpportunityClientMeeting (meetingType, outcome, notes). No
 *              status column exists → Status shows the meeting outcome. Client =
 *              the opportunity's account name.
 *   Tasks    : CrmTask status=Completed, completedAt in window. Related record
 *              via the shared resolveRelatedLabels resolver.
 *
 * Per-section rows are capped (MAX_ROWS_PER_SECTION) with an honest overflow
 * count so a heavy day cannot produce an unbounded email.
 */

import { prisma } from "@/lib/db/prisma";
import { resolveManagerTeam } from "@/lib/services/dashboard/team";
import { resolveRelatedLabels, rowKey } from "@/lib/services/activities/related-label-batch";
import type { SessionUser } from "@/types/permission";
import type { CrmTaskStatus } from "@prisma/client";

/** Max detail rows rendered per section per user; overflow surfaced as a count. */
export const MAX_ROWS_PER_SECTION = 50;

export interface CallDetail {
  time: Date | null;
  contact: string;
  company: string;
  durationLabel: string;
  outcome: string;
  notes: string;
}
export interface EmailDetail {
  time: Date | null;
  to: string;
  subject: string;
  delivery: string; // "Sent" — recorded; the model has no real delivery tracking
  replyStatus: string; // "Customer Replied" | "No Reply"
}
export interface MeetingDetail {
  time: Date | null;
  client: string;
  meetingType: string;
  status: string; // meeting outcome (no dedicated status column exists)
  notes: string;
}
export interface TaskDetail {
  time: Date | null; // completedAt
  task: string;
  relatedRecord: string;
  status: string;
}

export interface UserActivityDetail {
  userId: string;
  userName: string;
  calls: CallDetail[];
  callsTotal: number;
  emails: EmailDetail[];
  emailsTotal: number;
  meetings: MeetingDetail[];
  meetingsTotal: number;
  tasks: TaskDetail[];
  tasksTotal: number;
}

type Range = { from: Date; to: Date };

/**
 * Resolve the rep userIds in the recipient's tier scope, plus a display-name
 * map. Administrator → every user who owns activity in the org (discovered from
 * the data, so the digest lists exactly the people who did work). SalesManager →
 * managed team members. SalesUser → self.
 */
async function resolveScopedReps(
  user: SessionUser,
  range: Range,
): Promise<{ userIds: string[] | null; nameById: Map<string, string> }> {
  // null userIds = org-wide (no ownerId restriction) — Administrator.
  let userIds: string[] | null = null;

  if (user.role === "SalesManager") {
    const team = await resolveManagerTeam(user);
    const memberIds = team?.memberIds ?? [];
    userIds = memberIds.length > 0 ? memberIds : [user.userId];
  } else if (user.role !== "Administrator") {
    userIds = [user.userId];
  }

  // For the Administrator (org-wide) case, discover the actual owners who logged
  // activity in the window so we produce one section per active rep.
  if (userIds === null) {
    const owners = await prisma.crmActivity.groupBy({
      by: ["ownerId"],
      where: { orgId: user.orgId, ownerId: { not: null }, occurredAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
    });
    userIds = owners.map((o) => o.ownerId as string).filter(Boolean);
  }

  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const nameById = new Map(
    users.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || u.id]),
  );

  return { userIds, nameById };
}

function ownerFilter(userIds: string[] | null): Record<string, unknown> {
  // Administrator (null) → no ownerId restriction (org-wide).
  return userIds === null ? {} : { ownerId: { in: userIds } };
}

function durationLabel(durationSec: number | null | undefined): string {
  if (durationSec == null || durationSec <= 0) return "—";
  const min = Math.round(durationSec / 60);
  return min >= 1 ? `${min} min` : `${durationSec} sec`;
}

/**
 * Assemble the per-user activity detail for one recipient's tier scope + window.
 * Returns one UserActivityDetail per active rep, sorted by total activity desc.
 */
export async function assembleUserActivityDetail(
  user: SessionUser,
  range: Range,
): Promise<UserActivityDetail[]> {
  const { orgId } = user;
  const { userIds, nameById } = await resolveScopedReps(user, range);

  // An empty explicit scope (e.g. SalesManager with no members resolved to self,
  // but self has no id) — nothing to assemble.
  if (userIds !== null && userIds.length === 0) return [];

  const owner = ownerFilter(userIds);
  const windowWhere = { orgId, occurredAt: { gte: range.from, lt: range.to } };

  // ── Calls ─────────────────────────────────────────────────────────────────
  const callActivities = await prisma.crmActivity.findMany({
    where: { ...windowWhere, ...owner, type: "Call" },
    select: {
      ownerId: true,
      occurredAt: true,
      outcome: true,
      detailNotes: true,
      linkedCallLogId: true,
      relatedKind: true,
      relatedObjectId: true,
      relatedOrphanedAt: true,
    },
    orderBy: { occurredAt: "asc" },
  });

  const callLogIds = callActivities.map((c) => c.linkedCallLogId).filter((id): id is string => !!id);
  const callLogs = callLogIds.length
    ? await prisma.crmCallLog.findMany({
        where: { orgId, id: { in: callLogIds } },
        select: { id: true, durationSec: true, talkSec: true, notes: true, dispositionName: true },
      })
    : [];
  const callLogById = new Map(callLogs.map((l) => [l.id, l]));

  // Contact/company for calls come from the related Lead. Batch-resolve the
  // human "contact" label via the shared resolver; fetch the lead company too.
  const callLeadIds = callActivities
    .filter((c) => c.relatedKind.toLowerCase() === "lead")
    .map((c) => c.relatedObjectId);
  const callLeads = callLeadIds.length
    ? await prisma.crmLead.findMany({
        where: { orgId, id: { in: callLeadIds } },
        select: { id: true, company: true },
      })
    : [];
  const companyByLeadId = new Map(callLeads.map((l) => [l.id, l.company ?? ""]));
  const callContactLabels = await resolveRelatedLabels(orgId, callActivities);

  // ── Emails (outbound) ───────────────────────────────────────────────────────
  // CrmEmailMessage has no ownerId; the owner is the mailbox connection's user.
  // Resolve mailbox connections for the scoped users, then filter messages by
  // those connection ids. sentAt in window.
  const mailboxes = await prisma.crmMailboxConnection.findMany({
    where: { orgId, ...(userIds === null ? {} : { userId: { in: userIds } }) },
    select: { id: true, userId: true },
  });
  const mailboxUserById = new Map(mailboxes.map((m) => [m.id, m.userId]));
  const mailboxIds = mailboxes.map((m) => m.id);

  const emailMessages = mailboxIds.length
    ? await prisma.crmEmailMessage.findMany({
        where: {
          orgId,
          mailboxConnectionId: { in: mailboxIds },
          direction: "outbound",
          sentAt: { gte: range.from, lt: range.to },
        },
        select: {
          mailboxConnectionId: true,
          threadId: true,
          sentAt: true,
          toAddresses: true,
          subject: true,
        },
        orderBy: { sentAt: "asc" },
      })
    : [];

  // Reply derivation: a thread has a reply if it holds any inbound message after
  // the outbound sentAt. Batch: for the threads we touched, find inbound rows.
  const threadIds = [...new Set(emailMessages.map((m) => m.threadId))];
  const inboundRows = threadIds.length
    ? await prisma.crmEmailMessage.findMany({
        where: { orgId, threadId: { in: threadIds }, direction: "inbound" },
        select: { threadId: true, receivedAt: true },
      })
    : [];
  const inboundByThread = new Map<string, Date[]>();
  for (const r of inboundRows) {
    if (!r.receivedAt) continue;
    const arr = inboundByThread.get(r.threadId) ?? [];
    arr.push(r.receivedAt);
    inboundByThread.set(r.threadId, arr);
  }

  // ── Meetings ─────────────────────────────────────────────────────────────────
  // Meeting activities are type="OpportunityClientMeeting"; rich detail lives on
  // CrmOpportunityClientMeeting (join via opportunityId). Client = opp's account.
  const meetingActivities = await prisma.crmActivity.findMany({
    where: { ...windowWhere, ...owner, type: "OpportunityClientMeeting" },
    select: { ownerId: true, occurredAt: true, opportunityId: true, relatedObjectId: true },
    orderBy: { occurredAt: "asc" },
  });
  const meetingOppIds = [
    ...new Set(
      meetingActivities.map((m) => m.opportunityId ?? m.relatedObjectId).filter((id): id is string => !!id),
    ),
  ];
  const meetingRecords = meetingOppIds.length
    ? await prisma.crmOpportunityClientMeeting.findMany({
        where: { orgId, opportunityId: { in: meetingOppIds } },
        select: { opportunityId: true, meetingAt: true, meetingType: true, outcome: true, notes: true },
      })
    : [];
  const opps = meetingOppIds.length
    ? await prisma.crmOpportunity.findMany({
        where: { orgId, id: { in: meetingOppIds } },
        select: { id: true, name: true, account: { select: { name: true } } },
      })
    : [];
  const oppById = new Map(opps.map((o) => [o.id, o]));
  // Pick the meeting record closest to the activity's occurredAt per opp+time.
  const meetingByOppTime = new Map<string, (typeof meetingRecords)[number]>();
  for (const m of meetingRecords) {
    const k = `${m.opportunityId}:${m.meetingAt?.getTime() ?? 0}`;
    meetingByOppTime.set(k, m);
  }

  // ── Tasks (completed in window) ──────────────────────────────────────────────
  const taskOwner =
    userIds === null ? {} : { assignedToUserId: { in: userIds } };
  const completedTasks = await prisma.crmTask.findMany({
    where: {
      orgId,
      status: "Completed" as CrmTaskStatus,
      completedAt: { gte: range.from, lt: range.to },
      ...taskOwner,
    },
    select: {
      assignedToUserId: true,
      completedAt: true,
      subject: true,
      status: true,
      relatedKind: true,
      relatedObjectId: true,
    },
    orderBy: { completedAt: "asc" },
  });
  const taskRelatedLabels = await resolveRelatedLabels(
    orgId,
    completedTasks
      .filter((t) => t.relatedKind && t.relatedObjectId)
      .map((t) => ({ relatedKind: t.relatedKind as string, relatedObjectId: t.relatedObjectId as string })),
  );

  // ── Fold everything into per-user buckets ────────────────────────────────────
  const byUser = new Map<string, UserActivityDetail>();
  const ensure = (uid: string | null | undefined): UserActivityDetail | null => {
    if (!uid) return null;
    let u = byUser.get(uid);
    if (!u) {
      u = {
        userId: uid,
        userName: nameById.get(uid) ?? uid,
        calls: [],
        callsTotal: 0,
        emails: [],
        emailsTotal: 0,
        meetings: [],
        meetingsTotal: 0,
        tasks: [],
        tasksTotal: 0,
      };
      byUser.set(uid, u);
    }
    return u;
  };

  for (const c of callActivities) {
    const u = ensure(c.ownerId);
    if (!u) continue;
    u.callsTotal += 1;
    if (u.calls.length >= MAX_ROWS_PER_SECTION) continue;
    const log = c.linkedCallLogId ? callLogById.get(c.linkedCallLogId) : undefined;
    const contact = callContactLabels.get(rowKey(c)) ?? "—";
    const company =
      c.relatedKind.toLowerCase() === "lead" ? companyByLeadId.get(c.relatedObjectId) || "—" : "—";
    u.calls.push({
      time: c.occurredAt,
      contact,
      company,
      durationLabel: durationLabel(log?.talkSec ?? log?.durationSec ?? null),
      outcome: c.outcome || log?.dispositionName || "—",
      notes: c.detailNotes || log?.notes || "—",
    });
  }

  for (const m of emailMessages) {
    const uid = mailboxUserById.get(m.mailboxConnectionId);
    const u = ensure(uid);
    if (!u) continue;
    u.emailsTotal += 1;
    if (u.emails.length >= MAX_ROWS_PER_SECTION) continue;
    const inbound = inboundByThread.get(m.threadId) ?? [];
    const replied = m.sentAt ? inbound.some((d) => d.getTime() > m.sentAt!.getTime()) : inbound.length > 0;
    u.emails.push({
      time: m.sentAt,
      to: m.toAddresses[0] ?? "—",
      subject: m.subject || "(no subject)",
      delivery: "Sent",
      replyStatus: replied ? "Customer Replied" : "No Reply",
    });
  }

  for (const m of meetingActivities) {
    const u = ensure(m.ownerId);
    if (!u) continue;
    u.meetingsTotal += 1;
    if (u.meetings.length >= MAX_ROWS_PER_SECTION) continue;
    const oppId = m.opportunityId ?? m.relatedObjectId ?? "";
    const rec =
      meetingByOppTime.get(`${oppId}:${m.occurredAt?.getTime() ?? 0}`) ??
      meetingRecords.find((r) => r.opportunityId === oppId);
    const opp = oppById.get(oppId);
    u.meetings.push({
      time: m.occurredAt,
      client: opp?.account?.name || opp?.name || "—",
      meetingType: rec?.meetingType || "—",
      status: rec?.outcome || "Completed",
      notes: rec?.notes || "—",
    });
  }

  for (const t of completedTasks) {
    const u = ensure(t.assignedToUserId);
    if (!u) continue;
    u.tasksTotal += 1;
    if (u.tasks.length >= MAX_ROWS_PER_SECTION) continue;
    const related =
      t.relatedKind && t.relatedObjectId
        ? taskRelatedLabels.get(rowKey({ relatedKind: t.relatedKind, relatedObjectId: t.relatedObjectId })) ??
          "—"
        : "—";
    u.tasks.push({
      time: t.completedAt,
      task: t.subject,
      relatedRecord: related,
      status: t.status,
    });
  }

  // Sort users by total activity (busiest first), then by name for stability.
  return [...byUser.values()].sort((a, b) => {
    const ta = a.callsTotal + a.emailsTotal + a.meetingsTotal + a.tasksTotal;
    const tb = b.callsTotal + b.emailsTotal + b.meetingsTotal + b.tasksTotal;
    if (tb !== ta) return tb - ta;
    return a.userName.localeCompare(b.userName);
  });
}
