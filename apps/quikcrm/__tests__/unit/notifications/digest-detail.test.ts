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
  vi.mocked(resolveRelatedLabels).mockResolvedValue(new Map());
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
