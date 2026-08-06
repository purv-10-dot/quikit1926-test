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
 *   Everything else : ALL remaining CrmActivity rows in the window, grouped by
 *              their `type` label into one dynamic section each (otherSections).
 *
 * ─── Dynamic activity types (no hardcoded list) ───────────────────────────────
 * The four sections above stay specialized because they join extra tables for
 * columns that only they have (call duration, email reply derivation, meeting
 * outcome). EVERY OTHER activity type is discovered from the data itself: we
 * query all activities in the window that are not one of those, then group by
 * `CrmActivity.type`.
 *
 * `type` holds the Activity Type LABEL — the log form posts `selectedType.label`
 * — which is the same string the Activities page displays. So a type an admin
 * creates in Settings → Activity Types ("Bidding", "Client Interviews", …)
 * appears in the digest with NO code change. Section ORDER follows the org's
 * CrmActivityType.sortOrder so the email matches the settings screen; a type
 * present in the data but missing from the config still renders (sorted last)
 * rather than being silently dropped.
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
/**
 * One inbound reply received on a thread the rep sent into during the window.
 *
 * "Original Email" is the subject of the LATEST outbound message in the same
 * thread sent before this reply arrived — the mail the customer was answering.
 * Thread-based, matching how EmailDetail.replyStatus is already derived, so the
 * two can never disagree about whether a thread got a reply.
 */
export interface EmailReplyDetail {
  time: Date | null; // receivedAt
  from: string;
  subject: string;
  originalEmail: string;
  replyReceived: string; // always "Yes" — a row exists only because a reply landed
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

/**
 * One row of a DYNAMIC (non-specialized) activity-type section. Every activity
 * type that isn't one of the four rich sections above renders through this
 * shape, using only columns that exist on CrmActivity itself — so a brand-new
 * custom type works with no code change.
 */
export interface GenericActivityDetail {
  time: Date | null;
  relatedRecord: string;
  subject: string;
  outcome: string;
  notes: string;
}

/**
 * A dynamically-discovered activity-type section for one user. `typeLabel` is
 * the raw CrmActivity.type value, which is exactly the Activity Type label the
 * Activities page shows (the log form stores `selectedType.label`).
 */
export interface GenericActivitySection {
  typeLabel: string;
  rows: GenericActivityDetail[];
  total: number;
}

/**
 * One lead the rep worked on during the window, with a per-category breakdown.
 *
 * Built ENTIRELY from data already assembled for the other sections — no extra
 * queries. Every contributing source carries relatedKind/relatedObjectId, so a
 * row is attributed to a lead only when relatedKind === "Lead"; activity against
 * an Opportunity/Contact/Account, or standalone activity, is excluded rather than
 * bucketed under a misleading lead name.
 *
 * `breakdown` is pre-formatted ("3 Emails, 2 Replies, 1 Task") so the renderer
 * stays presentation-only, consistent with the other detail shapes.
 */
export interface LeadActivitySummary {
  leadId: string;
  leadName: string;
  total: number;
  breakdown: string;
}

export interface UserActivityDetail {
  userId: string;
  userName: string;
  calls: CallDetail[];
  callsTotal: number;
  emails: EmailDetail[];
  emailsTotal: number;
  /**
   * Inbound replies to this user's outbound emails. Deliberately NOT added to
   * Total Activities — a reply is the customer's action, not the rep's logged
   * work. See userTotal() in digest-email.ts.
   */
  emailReplies: EmailReplyDetail[];
  emailRepliesTotal: number;
  meetings: MeetingDetail[];
  meetingsTotal: number;
  tasks: TaskDetail[];
  tasksTotal: number;
  /**
   * Every OTHER activity type this user logged in the window, one section per
   * type, ordered by the org's configured Activity Type sortOrder. Empty when
   * the user logged nothing outside the four specialized sections.
   *
   * Always set by assembleUserActivityDetail. The email renderer still reads
   * this and `otherTotal` defensively, so a hand-built object that omits them
   * degrades to "no dynamic sections" instead of throwing.
   */
  otherSections: GenericActivitySection[];
  /** Sum of `total` across otherSections — counted in Total Activities. */
  otherTotal: number;
  /**
   * Lead-wise rollup of everything above, sorted by total desc. A VIEW of the
   * other sections, not a new data source — it adds nothing to Total Activities.
   * Capped at MAX_ROWS_PER_SECTION with `leadSummaryTotal` carrying the true
   * lead count so the renderer can show "+N more leads not shown".
   */
  leadSummary: LeadActivitySummary[];
  /** Distinct leads worked on — may exceed leadSummary.length when capped. */
  leadSummaryTotal: number;
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

/**
 * CrmActivity.type values already rendered by a SPECIALIZED section, which the
 * dynamic pass must therefore skip to avoid double-counting.
 *
 * Matching is case-insensitive because writers are inconsistent: the log form
 * stores the type LABEL ("Call", "Meeting"), the email sync stores lowercase
 * "email", and the opportunity client-meeting route stores
 * "OpportunityClientMeeting".
 *
 * NOTE: "Task" is deliberately NOT here. Task activities are a different record
 * (CrmTask, counted by completedAt), so a CrmActivity of type "Task" is not the
 * same row as a completed task and must still surface somewhere.
 */
const SPECIALIZED_TYPES = new Set(["call", "email", "meeting", "opportunityclientmeeting"]);

/**
 * The concrete `type` strings the specialized writers actually store, used as a
 * coarse `NOT in` filter in SQL. Prisma's `in` is case-sensitive, so this lists
 * the real casings; `isSpecializedType` then re-checks case-insensitively in JS
 * to catch any casing this list misses.
 */
const SPECIALIZED_TYPES_QUERY = [
  "Call",
  "call",
  "Email",
  "email",
  "Meeting",
  "meeting",
  "OpportunityClientMeeting",
] as const;

function isSpecializedType(type: string): boolean {
  return SPECIALIZED_TYPES.has(type.trim().toLowerCase());
}

/**
 * Order the dynamic sections the way Settings → Activity Types is ordered, so
 * the digest stays visually in sync with the settings screen. Types the org has
 * configured come first (by sortOrder, then label); any type present in the data
 * but absent from the config (legacy rows, renamed types, imports) sorts last
 * alphabetically rather than being dropped.
 *
 * Also returns `activeLabels` — every ACTIVE non-specialized type label in
 * configured order. The Team Member Summary renders a row for each of these even
 * when the user logged none, so leadership sees the full activity menu (a 0 is
 * information: "nobody did any demos today"). See padWithConfiguredTypes.
 */
async function activityTypeOrder(orgId: string): Promise<{
  rankOf: (label: string) => number;
  activeLabels: string[];
}> {
  const types = await prisma.crmActivityType.findMany({
    where: { orgId, isActive: true },
    select: { label: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const rankByLabel = new Map<string, number>();
  // Ordering is a presentation nicety: if the type config can't be read, fall
  // back to alphabetical rather than losing the sections entirely.
  (types ?? []).forEach((t, i) => {
    const k = t.label.trim().toLowerCase();
    if (!rankByLabel.has(k)) rankByLabel.set(k, i);
  });
  // The four specialized sections are always rendered on their own, so a
  // configured "Call"/"Email"/"Meeting" type must not also become a zero-count
  // dynamic row (it would read as a duplicate).
  const seen = new Set<string>();
  const activeLabels: string[] = [];
  for (const t of types ?? []) {
    const label = t.label.trim();
    if (!label || isSpecializedType(label)) continue;
    const k = label.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    activeLabels.push(label);
  }
  return {
    rankOf: (label: string) => rankByLabel.get(label.trim().toLowerCase()) ?? Number.MAX_SAFE_INTEGER,
    activeLabels,
  };
}

/**
 * Ensure every ACTIVE configured activity type has a section on the user, adding
 * `{ total: 0, rows: [] }` placeholders for the ones they didn't log.
 *
 * This is what lets the Team Member Summary list the full type menu. The DETAIL
 * band filters these back out (see digest-email renderUserBlock) so no empty
 * "Demo (0) / No Demo" section is rendered — the two bands intentionally show
 * different slices of the SAME list, so their labels can never disagree.
 *
 * Zero-count placeholders carry no rows, so they add nothing to otherTotal.
 */
function padWithConfiguredTypes(
  sections: GenericActivitySection[],
  activeLabels: string[],
): GenericActivitySection[] {
  const present = new Set(sections.map((s) => s.typeLabel.trim().toLowerCase()));
  const padded = [...sections];
  for (const label of activeLabels) {
    if (present.has(label.trim().toLowerCase())) continue;
    padded.push({ typeLabel: label, rows: [], total: 0 });
  }
  return padded;
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
          // For the lead-wise rollup — CrmEmailMessage carries its own related
          // record (indexed on orgId+relatedKind+relatedObjectId).
          relatedKind: true,
          relatedObjectId: true,
        },
        orderBy: { sentAt: "asc" },
      })
    : [];

  // Reply derivation: a thread has a reply if it holds any inbound message after
  // the outbound sentAt. Batch: for the threads we touched, find inbound rows.
  //
  // The same rows feed the 📩 Email Replies section, so we select the display
  // columns (fromAddress/subject) too — one query serves both the replyStatus
  // flag and the detailed reply table.
  const threadIds = [...new Set(emailMessages.map((m) => m.threadId))];
  const inboundRows = threadIds.length
    ? await prisma.crmEmailMessage.findMany({
        where: { orgId, threadId: { in: threadIds }, direction: "inbound" },
        select: {
          threadId: true,
          receivedAt: true,
          fromAddress: true,
          subject: true,
          relatedKind: true,
          relatedObjectId: true,
        },
        orderBy: { receivedAt: "asc" },
      })
    : [];
  const inboundByThread = new Map<string, Date[]>();
  for (const r of inboundRows) {
    if (!r.receivedAt) continue;
    const arr = inboundByThread.get(r.threadId) ?? [];
    arr.push(r.receivedAt);
    inboundByThread.set(r.threadId, arr);
  }

  // Thread → the rep's outbound messages, so a reply can name the mail it
  // answers and be attributed to the right user. A thread can hold outbound
  // mail from more than one scoped rep; each reply is credited to the rep whose
  // send most recently preceded it.
  const outboundByThread = new Map<string, { sentAt: Date; subject: string; userId: string }[]>();
  for (const m of emailMessages) {
    const uid = mailboxUserById.get(m.mailboxConnectionId);
    if (!uid || !m.sentAt) continue;
    const arr = outboundByThread.get(m.threadId) ?? [];
    arr.push({ sentAt: m.sentAt, subject: m.subject || "(no subject)", userId: uid });
    outboundByThread.set(m.threadId, arr);
  }

  // ── Meetings ─────────────────────────────────────────────────────────────────
  // Meeting activities are type="OpportunityClientMeeting"; rich detail lives on
  // CrmOpportunityClientMeeting (join via opportunityId). Client = opp's account.
  const meetingActivities = await prisma.crmActivity.findMany({
    where: { ...windowWhere, ...owner, type: "OpportunityClientMeeting" },
    select: {
      ownerId: true,
      occurredAt: true,
      opportunityId: true,
      relatedObjectId: true,
      // relatedKind lets the lead-wise rollup tell a Lead-linked meeting from an
      // Opportunity-linked one; the meeting section itself doesn't need it.
      relatedKind: true,
    },
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

  // ── Every OTHER activity type (dynamic — no hardcoded list) ──────────────────
  // One query for all activities in the window that are NOT handled by a
  // specialized section above. We do not enumerate type names: whatever types
  // exist in the data appear here, so a custom type created in Settings →
  // Activity Types shows up with zero code changes.
  const otherActivities = await prisma.crmActivity.findMany({
    where: {
      ...windowWhere,
      ...owner,
      NOT: { type: { in: [...SPECIALIZED_TYPES_QUERY] } },
    },
    select: {
      ownerId: true,
      type: true,
      occurredAt: true,
      subject: true,
      outcome: true,
      detailNotes: true,
      relatedKind: true,
      relatedObjectId: true,
      relatedOrphanedAt: true,
    },
    orderBy: { occurredAt: "asc" },
  });
  // The DB `NOT in` above is a coarse filter (exact strings). Apply the
  // case-insensitive guard in JS so e.g. "EMAIL" or "call" can never slip
  // through into a duplicate generic section.
  const genericActivities = (otherActivities ?? []).filter((a) => !isSpecializedType(a.type));
  const genericLabels = await resolveRelatedLabels(orgId, genericActivities);
  const { rankOf: rankOfType, activeLabels } = await activityTypeOrder(orgId);

  // ── Lead-wise rollup accumulator ────────────────────────────────────────────
  // A VIEW over the collections already fetched above — no new queries. Keyed
  // (userId → leadId → category → count). Declared before the fold loops so
  // every one of them (including email replies) can contribute.
  const leadRollup = new Map<string, Map<string, Map<string, number>>>();
  const bumpLead = (
    userId: string | null | undefined,
    relatedKind: string | null | undefined,
    relatedObjectId: string | null | undefined,
    category: string,
  ): void => {
    // Only Lead-related rows belong in a lead summary. Opportunity/Contact/
    // Account and standalone ("None") activity is intentionally excluded.
    if (!userId || !relatedObjectId) return;
    if ((relatedKind ?? "").toLowerCase() !== "lead") return;
    let byLead = leadRollup.get(userId);
    if (!byLead) {
      byLead = new Map();
      leadRollup.set(userId, byLead);
    }
    let counts = byLead.get(relatedObjectId);
    if (!counts) {
      counts = new Map();
      byLead.set(relatedObjectId, counts);
    }
    counts.set(category, (counts.get(category) ?? 0) + 1);
  };

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
        emailReplies: [],
        emailRepliesTotal: 0,
        meetings: [],
        meetingsTotal: 0,
        tasks: [],
        tasksTotal: 0,
        otherSections: [],
        otherTotal: 0,
        leadSummary: [],
        leadSummaryTotal: 0,
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

  // ── Email replies ───────────────────────────────────────────────────────────
  // One row per inbound message that landed after one of the rep's sends on the
  // same thread. Attributed to the rep whose outbound most recently preceded the
  // reply, so a thread touched by two reps credits each fairly. Inbound mail on
  // a thread the rep never sent into is not a reply to them and is skipped
  // (outboundByThread is keyed off this window's outbound messages only).
  for (const r of inboundRows) {
    if (!r.receivedAt) continue;
    const sends = outboundByThread.get(r.threadId);
    if (!sends?.length) continue;
    const preceding = sends.filter((s) => s.sentAt.getTime() < r.receivedAt!.getTime());
    if (!preceding.length) continue; // inbound predates every send — not a reply
    const original = preceding.reduce((a, b) => (a.sentAt >= b.sentAt ? a : b));
    const u = ensure(original.userId);
    if (!u) continue;
    u.emailRepliesTotal += 1;
    // Lead-wise rollup: attribute the reply to the same rep credited above.
    bumpLead(original.userId, r.relatedKind, r.relatedObjectId, "Replies");
    if (u.emailReplies.length >= MAX_ROWS_PER_SECTION) continue;
    u.emailReplies.push({
      time: r.receivedAt,
      from: r.fromAddress || "—",
      subject: r.subject || "(no subject)",
      originalEmail: original.subject,
      replyReceived: "Yes",
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

  for (const c of callActivities) bumpLead(c.ownerId, c.relatedKind, c.relatedObjectId, "Calls");
  for (const m of emailMessages) {
    bumpLead(mailboxUserById.get(m.mailboxConnectionId), m.relatedKind, m.relatedObjectId, "Emails");
  }
  for (const m of meetingActivities) {
    bumpLead(m.ownerId, m.relatedKind, m.relatedObjectId, "Meetings");
  }
  for (const t of completedTasks) {
    bumpLead(t.assignedToUserId, t.relatedKind, t.relatedObjectId, "Tasks");
  }
  // Dynamic types keep their own label ("Notes", "Stage Changed", custom types),
  // so the breakdown names exactly what the Activities module recorded.
  for (const a of genericActivities) {
    bumpLead(a.ownerId, a.relatedKind, a.relatedObjectId, a.type.trim() || "Other");
  }

  // Dynamic sections: bucket per (user → type label). The section list is built
  // from the DATA, so any activity type — default or custom — lands here.
  const sectionsByUser = new Map<string, Map<string, GenericActivitySection>>();
  for (const a of genericActivities) {
    const u = ensure(a.ownerId);
    if (!u) continue;
    const label = a.type.trim() || "Other";
    let perType = sectionsByUser.get(u.userId);
    if (!perType) {
      perType = new Map<string, GenericActivitySection>();
      sectionsByUser.set(u.userId, perType);
    }
    // Group case-insensitively so "Bidding" and "bidding" are one section, and
    // display the first casing we encountered.
    const key = label.toLowerCase();
    let section = perType.get(key);
    if (!section) {
      section = { typeLabel: label, rows: [], total: 0 };
      perType.set(key, section);
    }
    section.total += 1;
    u.otherTotal += 1;
    if (section.rows.length >= MAX_ROWS_PER_SECTION) continue;
    section.rows.push({
      time: a.occurredAt,
      relatedRecord: genericLabels.get(rowKey(a)) ?? "—",
      subject: a.subject || "—",
      outcome: a.outcome || "—",
      notes: a.detailNotes || "—",
    });
  }

  // Attach each user's sections in Settings → Activity Types order.
  //
  // Iterate EVERY user (not just those in sectionsByUser): a rep who logged only
  // calls still needs the zero-count placeholders so their Team Member Summary
  // lists the full active-type menu.
  for (const u of byUser.values()) {
    const perType = sectionsByUser.get(u.userId);
    const logged = perType ? [...perType.values()] : [];
    u.otherSections = padWithConfiguredTypes(logged, activeLabels).sort((a, b) => {
      const ra = rankOfType(a.typeLabel);
      const rb = rankOfType(b.typeLabel);
      if (ra !== rb) return ra - rb;
      return a.typeLabel.localeCompare(b.typeLabel);
    });
  }

  // ── Lead-wise summary: fold the accumulator into sorted display rows ─────────
  //
  // Lead NAMES: the label maps built for the other sections already cover most
  // leads (rowKey is "lead:<id>"). A lead reached only via a source with no
  // resolver pass — e.g. an email whose lead had no call/task/generic activity —
  // wouldn't be in them, so we batch-fetch exactly those stragglers in ONE query
  // rather than leaving rows labelled "—".
  const leadNameById = new Map<string, string>();
  for (const map of [callContactLabels, taskRelatedLabels, genericLabels]) {
    for (const [k, label] of map) {
      if (!k.startsWith("lead:")) continue;
      const id = k.slice("lead:".length);
      // Skip placeholder labels so a real name from another map can win.
      if (label && label !== "—" && label !== "(deleted)") leadNameById.set(id, label);
    }
  }
  const allLeadIds = new Set<string>();
  for (const byLead of leadRollup.values()) for (const id of byLead.keys()) allLeadIds.add(id);
  const missingLeadIds = [...allLeadIds].filter((id) => !leadNameById.has(id));
  if (missingLeadIds.length) {
    const rows = await prisma.crmLead.findMany({
      where: { orgId, id: { in: missingLeadIds } },
      select: { id: true, name: true, company: true },
    });
    for (const l of rows) leadNameById.set(l.id, l.name || l.company || "—");
  }

  // Category display order: the fixed sections first (matching the order they
  // appear in the email), then dynamic types alphabetically for stability.
  const CATEGORY_ORDER = ["Calls", "Emails", "Replies", "Meetings", "Tasks"];
  const categoryRank = (c: string): number => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  /** "3 Emails, 2 Replies, 1 Task" — singularises a trailing "s" when count is 1. */
  const formatBreakdown = (counts: Map<string, number>): string =>
    [...counts.entries()]
      .sort((a, b) => {
        const ra = categoryRank(a[0]);
        const rb = categoryRank(b[0]);
        if (ra !== rb) return ra - rb;
        return a[0].localeCompare(b[0]);
      })
      .map(([label, n]) => {
        const word = n === 1 && label.endsWith("s") ? label.slice(0, -1) : label;
        return `${n} ${word}`;
      })
      .join(", ");

  for (const u of byUser.values()) {
    const byLead = leadRollup.get(u.userId);
    if (!byLead?.size) continue; // leaves the [] / 0 defaults → honest empty state
    const summaries: LeadActivitySummary[] = [...byLead.entries()].map(([leadId, counts]) => ({
      leadId,
      leadName: leadNameById.get(leadId) ?? "—",
      total: [...counts.values()].reduce((s, n) => s + n, 0),
      breakdown: formatBreakdown(counts),
    }));
    // Most active leads first; name then id break ties so output is deterministic.
    summaries.sort(
      (a, b) => b.total - a.total || a.leadName.localeCompare(b.leadName) || a.leadId.localeCompare(b.leadId),
    );
    u.leadSummaryTotal = summaries.length;
    u.leadSummary = summaries.slice(0, MAX_ROWS_PER_SECTION);
  }

  // Sort users by total activity (busiest first), then by name for stability.
  return [...byUser.values()].sort((a, b) => {
    const ta = a.callsTotal + a.emailsTotal + a.meetingsTotal + a.tasksTotal + a.otherTotal;
    const tb = b.callsTotal + b.emailsTotal + b.meetingsTotal + b.tasksTotal + b.otherTotal;
    if (tb !== ta) return tb - ta;
    return a.userName.localeCompare(b.userName);
  });
}
