/**
 * digest-detail — per-user activity DETAIL assembly (redesign).
 *
 * assembleUserActivityDetail(user, range) fetches the ACTUAL records each rep
 * logged in the window and folds them into per-user buckets:
 *   Calls    — CrmActivity type="Call" → CrmCallLog (duration/disposition/notes),
 *              contact/company from the related Lead.
 *   Emails   — CrmEmailMessage direction="outbound"; reply DERIVED from an inbound
 *              message in the same thread; delivery is the honest "Sent".
 *   Meetings — CrmOpportunityClientMeeting (via the meeting activity's opp);
 *              status = the meeting outcome.
 *   Tasks    — CrmTask completed-in-window; related record via resolveRelatedLabels.
 *
 * This unit pins scope selection, the joins, reply derivation, the section cap,
 * and empty-state handling. Prisma is mocked; the related-label resolver is
 * mocked (it has its own test).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, resetPrismaUnitMocks } from "../../helpers/prisma-unit-mock";

vi.mock("@/lib/services/dashboard/team", () => ({ resolveManagerTeam: vi.fn() }));
vi.mock("@/lib/services/activities/related-label-batch", async () => {
  // Keep the real rowKey (pure string helper); mock only the DB-touching resolver.
  const actual = await vi.importActual<typeof import("@/lib/services/activities/related-label-batch")>(
    "@/lib/services/activities/related-label-batch",
  );
  return { ...actual, resolveRelatedLabels: vi.fn() };
});

import { assembleUserActivityDetail, MAX_ROWS_PER_SECTION } from "@/lib/services/notifications/digest-detail";
import { resolveManagerTeam } from "@/lib/services/dashboard/team";
import { resolveRelatedLabels } from "@/lib/services/activities/related-label-batch";

const RANGE = { from: new Date("2026-07-19T00:00:00.000Z"), to: new Date("2026-07-20T00:00:00.000Z") };
const ADMIN = { userId: "admin1", orgId: "org1", role: "Administrator", email: "a@x.co", name: "Admin" };
const SALES = { userId: "s1", orgId: "org1", role: "SalesUser", email: "s@x.co", name: "Sales" };

// crmActivity.groupBy is heavily overloaded; the deep mock doesn't expose the
// spy surface through that type. Narrow it to the spy shape we use here.
const activityGroupBy = prismaMock.crmActivity.groupBy as unknown as {
  mockResolvedValue: (v: unknown) => void;
  mock: { calls: unknown[][] };
};

// Convenience: set every query to a safe empty default, tests override as needed.
function stubEmpty() {
  activityGroupBy.mockResolvedValue([]);
  prismaMock.crmActivity.findMany.mockResolvedValue([] as never);
  prismaMock.crmCallLog.findMany.mockResolvedValue([] as never);
  prismaMock.crmLead.findMany.mockResolvedValue([] as never);
  prismaMock.crmMailboxConnection.findMany.mockResolvedValue([] as never);
  prismaMock.crmEmailMessage.findMany.mockResolvedValue([] as never);
  prismaMock.crmOpportunityClientMeeting.findMany.mockResolvedValue([] as never);
  prismaMock.crmOpportunity.findMany.mockResolvedValue([] as never);
  prismaMock.crmTask.findMany.mockResolvedValue([] as never);
  prismaMock.user.findMany.mockResolvedValue([] as never);
  prismaMock.crmActivityType.findMany.mockResolvedValue([] as never);
  vi.mocked(resolveRelatedLabels).mockResolvedValue(new Map());
}

/**
 * crmActivity.findMany is called several times in one assembly (calls,
 * meetings, then the dynamic "everything else" pass). Route each call by the
 * `type` filter in its where-clause so a test can supply just the rows it cares
 * about: `NOT` present → the dynamic pass; otherwise keyed by the exact type.
 */
function stubActivitiesByType(byType: Record<string, unknown[]>, other: unknown[] = []) {
  prismaMock.crmActivity.findMany.mockImplementation((async (args: {
    where?: { type?: unknown; NOT?: unknown };
  }) => {
    const where = args?.where ?? {};
    if (where.NOT) return other;
    const t = typeof where.type === "string" ? where.type : "";
    return byType[t] ?? [];
  }) as never);
}

beforeEach(() => {
  resetPrismaUnitMocks();
  vi.clearAllMocks();
  stubEmpty();
});

describe("assembleUserActivityDetail — scope selection", () => {
  it("Administrator → discovers active owners via crmActivity.groupBy, then scopes to that org-wide owner set", async () => {
    activityGroupBy.mockResolvedValue([
      { ownerId: "r1", _count: { _all: 3 } },
      { ownerId: "r2", _count: { _all: 1 } },
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "r1", firstName: "Rep", lastName: "One", email: "r1@x.co" },
      { id: "r2", firstName: "Rep", lastName: "Two", email: "r2@x.co" },
    ] as never);

    await assembleUserActivityDetail(ADMIN, RANGE);

    // owner-discovery groupBy is org-wide (orgId + window, ownerId not null)
    const gb = activityGroupBy.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(gb.where.orgId).toBe("org1");
    expect(gb.where.ownerId).toEqual({ not: null });
    // Detail queries are then scoped to the discovered owner set (equivalent to
    // org-wide, but narrows to reps who actually logged activity).
    const callWhere = (prismaMock.crmActivity.findMany.mock.calls.find(
      (c) => (c[0] as { where: { type?: string } }).where.type === "Call",
    )?.[0] as { where: { ownerId?: { in: string[] } } }).where;
    expect(callWhere.ownerId).toEqual({ in: ["r1", "r2"] });
  });

  it("SalesUser → own-only (ownerId restricted to self), no owner discovery", async () => {
    await assembleUserActivityDetail(SALES, RANGE);
    // No owner-discovery groupBy for non-admins
    expect(activityGroupBy.mock.calls.length).toBe(0);
    const callWhere = (prismaMock.crmActivity.findMany.mock.calls.find(
      (c) => (c[0] as { where: { type?: string } }).where.type === "Call",
    )?.[0] as { where: { ownerId?: { in: string[] } } }).where;
    expect(callWhere.ownerId).toEqual({ in: ["s1"] });
  });

  it("SalesManager → team member ids; falls back to self when no team resolves", async () => {
    vi.mocked(resolveManagerTeam).mockResolvedValue({ memberIds: ["m1", "m2"] } as never);
    const MGR = { userId: "mgr1", orgId: "org1", role: "SalesManager", email: "m@x.co", name: "Mgr" };
    await assembleUserActivityDetail(MGR, RANGE);
    const callWhere = (prismaMock.crmActivity.findMany.mock.calls.find(
      (c) => (c[0] as { where: { type?: string } }).where.type === "Call",
    )?.[0] as { where: { ownerId?: { in: string[] } } }).where;
    expect(callWhere.ownerId).toEqual({ in: ["m1", "m2"] });
  });

  it("every query is orgId-scoped (tenant isolation)", async () => {
    await assembleUserActivityDetail(SALES, RANGE);
    for (const call of prismaMock.crmActivity.findMany.mock.calls) {
      expect((call[0] as { where: { orgId: string } }).where.orgId).toBe("org1");
    }
  });
});

describe("assembleUserActivityDetail — calls", () => {
  it("joins the call log for duration/outcome/notes and the lead for company", async () => {
    activityGroupBy.mockResolvedValue([{ ownerId: "r1", _count: { _all: 1 } }]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "r1", firstName: "Rep", lastName: "One", email: "r1@x.co" }] as never);
    prismaMock.crmActivity.findMany.mockImplementation((async (args: { where: { type?: string } }) => {
      if (args.where.type === "Call") {
        return [
          {
            ownerId: "r1",
            occurredAt: new Date("2026-07-19T09:15:00.000Z"),
            outcome: "Interested",
            detailNotes: "Demo scheduled",
            linkedCallLogId: "cl1",
            relatedKind: "Lead",
            relatedObjectId: "lead1",
            relatedOrphanedAt: null,
          },
        ];
      }
      return [];
    }) as never);
    prismaMock.crmCallLog.findMany.mockResolvedValue([
      { id: "cl1", durationSec: 720, talkSec: 700, notes: "log note", dispositionName: "Connected" },
    ] as never);
    prismaMock.crmLead.findMany.mockResolvedValue([{ id: "lead1", company: "ABC Pvt Ltd" }] as never);
    vi.mocked(resolveRelatedLabels).mockResolvedValue(new Map([["lead:lead1", "Amit Jain"]]));

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);
    expect(rep.callsTotal).toBe(1);
    expect(rep.calls[0]).toMatchObject({
      contact: "Amit Jain",
      company: "ABC Pvt Ltd",
      durationLabel: "12 min", // talkSec 700 → ~12 min
      outcome: "Interested",
      notes: "Demo scheduled",
    });
  });
});

describe("assembleUserActivityDetail — emails + reply derivation", () => {
  beforeEach(() => {
    activityGroupBy.mockResolvedValue([{ ownerId: "r1", _count: { _all: 1 } }]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "r1", firstName: "Rep", lastName: "One", email: "r1@x.co" }] as never);
    prismaMock.crmMailboxConnection.findMany.mockResolvedValue([{ id: "mb1", userId: "r1" }] as never);
  });

  it("outbound email with a later inbound in the same thread → 'Customer Replied'", async () => {
    prismaMock.crmEmailMessage.findMany.mockImplementation((async (args: { where: { direction: string } }) => {
      if (args.where.direction === "outbound") {
        return [
          {
            mailboxConnectionId: "mb1",
            threadId: "t1",
            sentAt: new Date("2026-07-19T10:05:00.000Z"),
            toAddresses: ["amit@abc.com"],
            subject: "Product Brochure",
          },
        ];
      }
      // inbound query
      return [{ threadId: "t1", receivedAt: new Date("2026-07-19T12:00:00.000Z") }];
    }) as never);

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);
    expect(rep.emails[0]).toMatchObject({
      to: "amit@abc.com",
      subject: "Product Brochure",
      delivery: "Sent",
      replyStatus: "Customer Replied",
    });
  });

  it("outbound email with no inbound → 'No Reply'", async () => {
    prismaMock.crmEmailMessage.findMany.mockImplementation((async (args: { where: { direction: string } }) => {
      if (args.where.direction === "outbound") {
        return [
          {
            mailboxConnectionId: "mb1",
            threadId: "t1",
            sentAt: new Date("2026-07-19T10:05:00.000Z"),
            toAddresses: ["sales@xyz.com"],
            subject: "Pricing Quote",
          },
        ];
      }
      return [];
    }) as never);

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);
    expect(rep.emails[0].replyStatus).toBe("No Reply");
  });
});

/**
 * EMAIL REPLIES — regression suite.
 *
 * Bug: the reply derivation collected candidate threads from outbound mail sent
 * INSIDE the digest window, then queried inbound on those threads with no date
 * filter at all. Both halves were wrong:
 *   - a customer replying the day after the send (the normal case) was missed,
 *     because that thread had no in-window outbound → Email Replies stuck at 0;
 *   - when a thread did qualify, replies from ANY date counted, so the number
 *     didn't track the window.
 *
 * Fix: thread OWNERSHIP comes from unbounded outbound history ("has this rep
 * ever sent into this thread?"); the window is applied to the inbound
 * receivedAt. Cold inbound (no preceding send) is still excluded.
 */
describe("assembleUserActivityDetail — email replies", () => {
  beforeEach(() => {
    activityGroupBy.mockResolvedValue([{ ownerId: "r1", _count: { _all: 1 } }]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "r1", firstName: "Rep", lastName: "One", email: "r1@x.co" },
    ] as never);
    prismaMock.crmMailboxConnection.findMany.mockResolvedValue([{ id: "mb1", userId: "r1" }] as never);
  });

  const send = (over: Record<string, unknown> = {}) => ({
    mailboxConnectionId: "mb1",
    threadId: "t1",
    sentAt: new Date("2026-07-19T10:00:00.000Z"),
    toAddresses: ["amit@abc.com"],
    subject: "Product Brochure",
    ...over,
  });
  const reply = (over: Record<string, unknown> = {}) => ({
    threadId: "t1",
    receivedAt: new Date("2026-07-19T15:00:00.000Z"),
    fromAddress: "amit@abc.com",
    subject: "Re: Product Brochure",
    ...over,
  });

  /**
   * Route the THREE crmEmailMessage queries the assembly now issues:
   *   windowed outbound  → direction outbound + sentAt.gte  (Emails Sent)
   *   ownership outbound → direction outbound, no sentAt.gte (thread ownership)
   *   inbound            → direction inbound                (replies)
   * Each arg is the rows that query should return, so a test can make the
   * window and the history disagree — which is the whole point of the bug.
   */
  function stubEmail(opts: {
    windowedOutbound?: unknown[];
    historyOutbound?: unknown[];
    inbound?: unknown[];
  }) {
    prismaMock.crmEmailMessage.findMany.mockImplementation((async (args: {
      where: { direction: string; sentAt?: { gte?: Date } };
    }) => {
      if (args.where.direction === "outbound") {
        return args.where.sentAt?.gte
          ? (opts.windowedOutbound ?? [])
          : (opts.historyOutbound ?? []);
      }
      return opts.inbound ?? [];
    }) as never);
  }

  it("CROSS-DAY reply counts: rep sent 10 Aug, customer replied in-window, no send this window", async () => {
    stubEmail({
      windowedOutbound: [], // rep sent nothing today
      historyOutbound: [send({ sentAt: new Date("2026-07-18T10:00:00.000Z") })], // yesterday
      inbound: [reply()],
    });

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.emailsTotal).toBe(0); // Emails Sent stays window-bounded
    expect(rep.emailRepliesTotal).toBe(1); // the reply is still credited
    expect(rep.emailReplies[0]).toMatchObject({
      from: "amit@abc.com",
      subject: "Re: Product Brochure",
      originalEmail: "Product Brochure", // names the mail it answers
      replyReceived: "Yes",
    });
  });

  it("SAME-DAY reply counts once, and marks the sent mail 'Customer Replied'", async () => {
    stubEmail({
      windowedOutbound: [send()],
      historyOutbound: [send()],
      inbound: [reply()],
    });

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.emailsTotal).toBe(1);
    expect(rep.emailRepliesTotal).toBe(1);
    expect(rep.emails[0].replyStatus).toBe("Customer Replied");
  });

  it("COLD inbound does NOT count — no preceding send from a scoped rep on that thread", async () => {
    stubEmail({
      windowedOutbound: [],
      historyOutbound: [], // rep never sent into any thread
      inbound: [reply({ threadId: "cold", fromAddress: "stranger@nowhere.com" })],
    });

    const result = await assembleUserActivityDetail(ADMIN, RANGE);

    // No activity at all for this rep → not listed; certainly no reply credited.
    expect(result.find((u) => u.userId === "r1")?.emailRepliesTotal ?? 0).toBe(0);
  });

  it("inbound that PREDATES every send on an owned thread is not a reply", async () => {
    stubEmail({
      windowedOutbound: [send({ sentAt: new Date("2026-07-19T16:00:00.000Z") })],
      historyOutbound: [send({ sentAt: new Date("2026-07-19T16:00:00.000Z") })],
      inbound: [reply({ receivedAt: new Date("2026-07-19T09:00:00.000Z") })], // before the send
    });

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.emailsTotal).toBe(1);
    expect(rep.emailRepliesTotal).toBe(0);
  });

  it("OUTBOUND is counted only in Emails Sent, never as a reply", async () => {
    stubEmail({
      windowedOutbound: [send()],
      historyOutbound: [send()],
      inbound: [],
    });

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.emailsTotal).toBe(1);
    expect(rep.emailRepliesTotal).toBe(0);
    expect(rep.emails[0].replyStatus).toBe("No Reply");
  });

  it("FUTURE reply does not affect the earlier digest (replyStatus stays 'No Reply')", async () => {
    // Rep sends in-window; the customer answers AFTER range.to, so the inbound
    // query (receivedAt < range.to) returns nothing for this window.
    stubEmail({
      windowedOutbound: [send()],
      historyOutbound: [send()],
      inbound: [], // tomorrow's reply is outside the window
    });

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.emailRepliesTotal).toBe(0);
    expect(rep.emails[0].replyStatus).toBe("No Reply");
  });

  it("two replies on one owned thread count twice (rows, not threads) and are not deduped away", async () => {
    stubEmail({
      windowedOutbound: [send()],
      historyOutbound: [send()],
      inbound: [
        reply({ receivedAt: new Date("2026-07-19T12:00:00.000Z"), subject: "Re: one" }),
        reply({ receivedAt: new Date("2026-07-19T13:00:00.000Z"), subject: "Re: two" }),
      ],
    });

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.emailRepliesTotal).toBe(2);
    expect(rep.emails[0].replyStatus).toBe("Customer Replied"); // one flag, still consistent
  });

  it("a duplicate provider message never reaches the fold — dedupe is the unique index, so one row = one reply", async () => {
    // persistMessage dedupes on @@unique([orgId, mailboxConnectionId,
    // providerMessageId]), so a re-synced message yields ONE row. The digest
    // counts rows, so the same reply cannot be counted twice.
    stubEmail({
      windowedOutbound: [send()],
      historyOutbound: [send()],
      inbound: [reply()], // re-sync produced no second row
    });

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.emailRepliesTotal).toBe(1);
  });

  it("each reply is credited to the rep whose send most recently preceded it", async () => {
    activityGroupBy.mockResolvedValue([
      { ownerId: "r1", _count: { _all: 1 } },
      { ownerId: "r2", _count: { _all: 1 } },
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "r1", firstName: "Rep", lastName: "One", email: "r1@x.co" },
      { id: "r2", firstName: "Rep", lastName: "Two", email: "r2@x.co" },
    ] as never);
    prismaMock.crmMailboxConnection.findMany.mockResolvedValue([
      { id: "mb1", userId: "r1" },
      { id: "mb2", userId: "r2" },
    ] as never);
    stubEmail({
      windowedOutbound: [],
      historyOutbound: [
        send({ mailboxConnectionId: "mb1", sentAt: new Date("2026-07-18T08:00:00.000Z"), subject: "First touch" }),
        send({ mailboxConnectionId: "mb2", sentAt: new Date("2026-07-18T20:00:00.000Z"), subject: "Follow-up" }),
      ],
      inbound: [reply({ receivedAt: new Date("2026-07-19T09:00:00.000Z") })],
    });

    const result = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(result.find((u) => u.userId === "r2")?.emailRepliesTotal).toBe(1);
    expect(result.find((u) => u.userId === "r1")?.emailRepliesTotal ?? 0).toBe(0);
    expect(result.find((u) => u.userId === "r2")?.emailReplies[0].originalEmail).toBe("Follow-up");
  });

  it("query shape: Emails Sent stays windowed; ownership is unbounded; inbound is windowed on receivedAt", async () => {
    stubEmail({ windowedOutbound: [send()], historyOutbound: [send()], inbound: [reply()] });

    await assembleUserActivityDetail(ADMIN, RANGE);

    const wheres = prismaMock.crmEmailMessage.findMany.mock.calls.map(
      (c) => (c[0] as { where: Record<string, unknown> }).where,
    );
    const windowed = wheres.find(
      (w) => w.direction === "outbound" && (w.sentAt as { gte?: Date })?.gte,
    );
    const ownership = wheres.find(
      (w) => w.direction === "outbound" && !(w.sentAt as { gte?: Date })?.gte,
    );
    const inbound = wheres.find((w) => w.direction === "inbound");

    expect(windowed?.sentAt).toEqual({ gte: RANGE.from, lt: RANGE.to });
    // Ownership must NOT lower-bound the send — that was the bug.
    expect(ownership).toBeDefined();
    expect((ownership!.sentAt as { gte?: Date }).gte).toBeUndefined();
    expect(inbound?.receivedAt).toEqual({ gte: RANGE.from, lt: RANGE.to });
    // Tenant isolation on all three.
    for (const w of wheres) expect(w.orgId).toBe("org1");
  });
});

describe("assembleUserActivityDetail — meetings + tasks", () => {
  it("meeting status = the meeting outcome; client = opp account name", async () => {
    activityGroupBy.mockResolvedValue([{ ownerId: "r1", _count: { _all: 1 } }]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "r1", firstName: "Rep", lastName: "One", email: "r1@x.co" }] as never);
    prismaMock.crmActivity.findMany.mockImplementation((async (args: { where: { type?: string } }) => {
      if (args.where.type === "OpportunityClientMeeting") {
        return [
          { ownerId: "r1", occurredAt: new Date("2026-07-19T11:30:00.000Z"), opportunityId: "opp1", relatedObjectId: "opp1" },
        ];
      }
      return [];
    }) as never);
    prismaMock.crmOpportunityClientMeeting.findMany.mockResolvedValue([
      { opportunityId: "opp1", meetingAt: new Date("2026-07-19T11:30:00.000Z"), meetingType: "Demo", outcome: "Positive", notes: "went well" },
    ] as never);
    prismaMock.crmOpportunity.findMany.mockResolvedValue([
      { id: "opp1", name: "Opp One", account: { name: "XYZ Ltd" } },
    ] as never);

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);
    expect(rep.meetings[0]).toMatchObject({
      client: "XYZ Ltd",
      meetingType: "Demo",
      status: "Positive",
      notes: "went well",
    });
  });

  it("completed tasks resolve their related record label", async () => {
    activityGroupBy.mockResolvedValue([{ ownerId: "r1", _count: { _all: 1 } }]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "r1", firstName: "Rep", lastName: "One", email: "r1@x.co" }] as never);
    prismaMock.crmTask.findMany.mockResolvedValue([
      {
        assignedToUserId: "r1",
        completedAt: new Date("2026-07-19T14:00:00.000Z"),
        subject: "Send proposal",
        status: "Completed",
        relatedKind: "Account",
        relatedObjectId: "acc1",
      },
    ] as never);
    vi.mocked(resolveRelatedLabels).mockResolvedValue(new Map([["account:acc1", "ABC Pvt Ltd"]]));

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);
    expect(rep.tasks[0]).toMatchObject({
      task: "Send proposal",
      relatedRecord: "ABC Pvt Ltd",
      status: "Completed",
    });
    // completed-task query filters status + completedAt window
    const taskWhere = (prismaMock.crmTask.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(taskWhere.status).toBe("Completed");
    expect(taskWhere.completedAt).toEqual({ gte: RANGE.from, lt: RANGE.to });
  });
});

describe("assembleUserActivityDetail — cap + empty", () => {
  it("caps calls at MAX_ROWS_PER_SECTION but keeps the true total", async () => {
    activityGroupBy.mockResolvedValue([{ ownerId: "r1", _count: { _all: 60 } }]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "r1", firstName: "Rep", lastName: "One", email: "r1@x.co" }] as never);
    const manyCalls = Array.from({ length: 60 }, (_, i) => ({
      ownerId: "r1",
      occurredAt: new Date("2026-07-19T09:00:00.000Z"),
      outcome: `o${i}`,
      detailNotes: null,
      linkedCallLogId: null,
      relatedKind: "None",
      relatedObjectId: "x",
      relatedOrphanedAt: null,
    }));
    prismaMock.crmActivity.findMany.mockImplementation((async (args: { where: { type?: string } }) =>
      args.where.type === "Call" ? manyCalls : []) as never);

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);
    expect(rep.callsTotal).toBe(60); // true total preserved
    expect(rep.calls.length).toBe(MAX_ROWS_PER_SECTION); // rendered rows capped
  });

  it("no activity anywhere → empty user list", async () => {
    const result = await assembleUserActivityDetail(ADMIN, RANGE);
    expect(result).toEqual([]);
  });
});

/**
 * DYNAMIC ACTIVITY TYPES — the digest must cover EVERY activity type, including
 * custom ones created in Settings → Activity Types, with no hardcoded list.
 * Regression for: only Calls/Emails/Meetings/Tasks appeared in the digest, so
 * custom types (and 8 of the 12 seeded defaults) were silently missing.
 */
describe("assembleUserActivityDetail — dynamic activity types", () => {
  const genericRow = (type: string, over: Record<string, unknown> = {}) => ({
    ownerId: "r1",
    type,
    occurredAt: new Date("2026-07-19T09:00:00.000Z"),
    subject: `${type} subject`,
    outcome: "Positive",
    detailNotes: `${type} notes`,
    relatedKind: "Lead",
    relatedObjectId: "l1",
    relatedOrphanedAt: null,
    ...over,
  });

  beforeEach(() => {
    activityGroupBy.mockResolvedValue([{ ownerId: "r1", _count: { _all: 1 } }]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "r1", firstName: "Rep", lastName: "One", email: "r1@x.co" },
    ] as never);
  });

  it("surfaces a CUSTOM activity type as its own section", async () => {
    stubActivitiesByType({}, [genericRow("Bidding")]);

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    const bidding = rep.otherSections.find((s) => s.typeLabel === "Bidding");
    expect(bidding).toBeDefined();
    expect(bidding!.total).toBe(1);
    expect(bidding!.rows[0].subject).toBe("Bidding subject");
    expect(rep.otherTotal).toBe(1);
  });

  it("creates one section per distinct type — no hardcoded set", async () => {
    stubActivitiesByType({}, [
      genericRow("Bidding"),
      genericRow("Client Interviews"),
      genericRow("LinkedIn Connect"),
      genericRow("Bidding"),
    ]);

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.otherSections.map((s) => s.typeLabel).sort()).toEqual([
      "Bidding",
      "Client Interviews",
      "LinkedIn Connect",
    ]);
    expect(rep.otherSections.find((s) => s.typeLabel === "Bidding")!.total).toBe(2);
    expect(rep.otherTotal).toBe(4);
  });

  it("includes seeded defaults that have no specialized section (Note, WhatsApp, Site Visit…)", async () => {
    stubActivitiesByType({}, [
      genericRow("Note"),
      genericRow("WhatsApp"),
      genericRow("Site Visit"),
      genericRow("Document Shared"),
    ]);

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.otherSections.map((s) => s.typeLabel).sort()).toEqual([
      "Document Shared",
      "Note",
      "Site Visit",
      "WhatsApp",
    ]);
    expect(rep.otherTotal).toBe(4);
  });

  it("orders sections by the org's Activity Type sortOrder (settings-synchronized)", async () => {
    prismaMock.crmActivityType.findMany.mockResolvedValue([
      { label: "Site Visit", sortOrder: 0 },
      { label: "Bidding", sortOrder: 1 },
      { label: "Note", sortOrder: 2 },
    ] as never);
    stubActivitiesByType({}, [genericRow("Note"), genericRow("Bidding"), genericRow("Site Visit")]);

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.otherSections.map((s) => s.typeLabel)).toEqual(["Site Visit", "Bidding", "Note"]);
  });

  it("a type present in data but absent from config still renders (sorted last, never dropped)", async () => {
    prismaMock.crmActivityType.findMany.mockResolvedValue([
      { label: "Bidding", sortOrder: 0 },
    ] as never);
    stubActivitiesByType({}, [genericRow("Legacy Import Type"), genericRow("Bidding")]);

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.otherSections.map((s) => s.typeLabel)).toEqual(["Bidding", "Legacy Import Type"]);
  });

  it("does NOT duplicate types that already have a specialized section", async () => {
    // The dynamic pass filters case-insensitively even if the coarse SQL NOT-in
    // let a differently-cased row through.
    stubActivitiesByType({}, [genericRow("call"), genericRow("EMAIL"), genericRow("Bidding")]);

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.otherSections.map((s) => s.typeLabel)).toEqual(["Bidding"]);
    expect(rep.otherTotal).toBe(1);
  });

  /**
   * Zero-count padding: every ACTIVE configured type gets a section (total 0)
   * so the Team Member Summary can list the full activity menu. The email's
   * detail band filters these out again — see digest-email.test.ts.
   */
  describe("zero-count padding for configured types", () => {
    it("pads active configured types the user did NOT log (total 0, no rows)", async () => {
      prismaMock.crmActivityType.findMany.mockResolvedValue([
        { label: "WhatsApp", sortOrder: 0 },
        { label: "Demo", sortOrder: 1 },
        { label: "Site Visit", sortOrder: 2 },
      ] as never);
      stubActivitiesByType({}, [genericRow("WhatsApp")]);

      const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

      expect(rep.otherSections.map((s) => s.typeLabel)).toEqual(["WhatsApp", "Demo", "Site Visit"]);
      const demo = rep.otherSections.find((s) => s.typeLabel === "Demo")!;
      expect(demo.total).toBe(0);
      expect(demo.rows).toEqual([]);
    });

    it("padding never inflates otherTotal", async () => {
      prismaMock.crmActivityType.findMany.mockResolvedValue([
        { label: "WhatsApp", sortOrder: 0 },
        { label: "Demo", sortOrder: 1 },
      ] as never);
      stubActivitiesByType({}, [genericRow("WhatsApp")]);

      const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

      expect(rep.otherTotal).toBe(1);
    });

    it("pads a user who logged only calls (no generic activity at all)", async () => {
      prismaMock.crmActivityType.findMany.mockResolvedValue([
        { label: "Demo", sortOrder: 0 },
      ] as never);
      // Only a Call activity — the generic query returns nothing for this user.
      stubActivitiesByType(
        {
          Call: [
            {
              ownerId: "r1",
              occurredAt: new Date("2026-07-19T09:00:00.000Z"),
              outcome: "Connected",
              detailNotes: "n",
              linkedCallLogId: null,
              relatedKind: "Lead",
              relatedObjectId: "l1",
              relatedOrphanedAt: null,
            },
          ],
        },
        [],
      );

      const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

      expect(rep.callsTotal).toBe(1);
      expect(rep.otherSections.map((s) => s.typeLabel)).toEqual(["Demo"]);
      expect(rep.otherTotal).toBe(0);
    });

    it("does NOT pad a configured type that has a specialized section", async () => {
      prismaMock.crmActivityType.findMany.mockResolvedValue([
        { label: "Call", sortOrder: 0 },
        { label: "Email", sortOrder: 1 },
        { label: "Meeting", sortOrder: 2 },
        { label: "Demo", sortOrder: 3 },
      ] as never);
      // One logged activity so the rep appears at all (a user with zero
      // activity is never listed in the digest).
      stubActivitiesByType({}, [genericRow("Demo")]);

      const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

      // Call/Email/Meeting already render as specialized sections; padding them
      // would duplicate the label in the summary.
      expect(rep.otherSections.map((s) => s.typeLabel)).toEqual(["Demo"]);
    });

    it("no configured types → no padding (unchanged behavior)", async () => {
      prismaMock.crmActivityType.findMany.mockResolvedValue([] as never);
      stubActivitiesByType({}, [genericRow("Bidding")]);

      const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

      expect(rep.otherSections.map((s) => s.typeLabel)).toEqual(["Bidding"]);
    });
  });

  it("caps dynamic section rows but keeps the true total", async () => {
    const many = Array.from({ length: 60 }, () => genericRow("Bidding"));
    stubActivitiesByType({}, many);

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    const bidding = rep.otherSections[0];
    expect(bidding.total).toBe(60);
    expect(bidding.rows.length).toBe(MAX_ROWS_PER_SECTION);
  });

  it("no other-type activity → empty otherSections, zero otherTotal", async () => {
    stubActivitiesByType({ Call: [
      {
        ownerId: "r1",
        occurredAt: new Date("2026-07-19T09:00:00.000Z"),
        outcome: "Connected",
        detailNotes: null,
        linkedCallLogId: null,
        relatedKind: "None",
        relatedObjectId: "x",
        relatedOrphanedAt: null,
      },
    ] }, []);

    const [rep] = await assembleUserActivityDetail(ADMIN, RANGE);

    expect(rep.otherSections).toEqual([]);
    expect(rep.otherTotal).toBe(0);
  });
});
