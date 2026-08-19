/**
 * Sales Cost record counts — asserts they are read from the EXISTING CRM
 * ownership columns and nothing else.
 *
 * These tests exist to catch the two ways this feature could silently go wrong:
 *   1. counting against the wrong ownership column (prospects use `savedById`,
 *      not `ownerId`), which would report zeros forever;
 *   2. dropping the org filter or the soft-delete filter, which would leak
 *      another tenant's records into a cost calculation.
 *
 * The queries are asserted through the mocked Prisma client, so a schema or
 * column rename shows up here rather than in production.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb } from "../helpers/mockDb";

const db = mockDb();

import { getRepCounts, getRepCountsBulk } from "@/lib/services/sales-cost/counts";
import { parsePeriod } from "@/lib/services/sales-cost/period";

const AUGUST = parsePeriod("2026-08")!;

/**
 * Prisma's `groupBy` delegate is a heavily-overloaded generic, so
 * `vitest-mock-extended` cannot surface `mockResolvedValue` on it through the
 * public type. Narrow to the mock surface we actually use — the alternative is
 * `as any`, which this app's ESLint config forbids.
 */
type GroupByMock = {
  mockResolvedValue: (v: unknown) => void;
  mockResolvedValueOnce: (v: unknown) => GroupByMock;
  mock: { calls: unknown[][] };
} & { not?: never };

const leadGroupBy = db.crmLead.groupBy as unknown as GroupByMock;
const prospectGroupBy = db.crmProspect.groupBy as unknown as GroupByMock;
const oppGroupBy = db.crmOpportunity.groupBy as unknown as GroupByMock;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRepCounts", () => {
  beforeEach(() => {
    db.crmLead.count.mockResolvedValue(100);
    db.crmProspect.count.mockResolvedValue(40);
    // Two crmOpportunity.count calls: total opportunities, then won deals.
    db.crmOpportunity.count.mockResolvedValueOnce(10).mockResolvedValueOnce(5);
  });

  it("returns the four counts from existing CRM tables", async () => {
    const counts = await getRepCounts("org-1", "rep-1", AUGUST);
    expect(counts).toEqual({ leads: 100, prospects: 40, opportunities: 10, wonDeals: 5 });
  });

  it("counts leads by CrmLead.ownerId, org-scoped, excluding soft-deleted", async () => {
    await getRepCounts("org-1", "rep-1", AUGUST);
    expect(db.crmLead.count).toHaveBeenCalledWith({
      where: {
        orgId: "org-1",
        ownerId: "rep-1",
        deletedAt: null,
        createdAt: { gte: AUGUST.start, lt: AUGUST.end },
      },
    });
  });

  it("counts prospects by savedById — the prospect ownership column", async () => {
    await getRepCounts("org-1", "rep-1", AUGUST);
    const arg = db.crmProspect.count.mock.calls[0]?.[0];
    // CrmProspect has no ownerId and no deletedAt; using either would be a bug.
    expect(arg?.where).toEqual({
      orgId: "org-1",
      savedById: "rep-1",
      createdAt: { gte: AUGUST.start, lt: AUGUST.end },
    });
  });

  it("counts won deals by ClosedWon and by when they CLOSED, not when created", async () => {
    await getRepCounts("org-1", "rep-1", AUGUST);
    const wonCall = db.crmOpportunity.count.mock.calls[1]?.[0];
    expect(wonCall?.where).toMatchObject({
      orgId: "org-1",
      ownerId: "rep-1",
      deletedAt: null,
      stage: "ClosedWon",
    });
    // A deal won in August counts for August whenever it was created.
    expect(wonCall?.where?.OR).toEqual([
      { closeDate: { gte: AUGUST.start, lt: AUGUST.end } },
      {
        closeDate: null,
        lastStageChangeAt: { gte: AUGUST.start, lt: AUGUST.end },
      },
    ]);
  });

  it("every query filters on orgId", async () => {
    await getRepCounts("org-1", "rep-1", AUGUST);
    const allCalls = [
      db.crmLead.count.mock.calls[0]?.[0],
      db.crmProspect.count.mock.calls[0]?.[0],
      db.crmOpportunity.count.mock.calls[0]?.[0],
      db.crmOpportunity.count.mock.calls[1]?.[0],
    ];
    for (const call of allCalls) {
      expect(call?.where).toHaveProperty("orgId", "org-1");
    }
  });
});

describe("getRepCountsBulk", () => {
  it("returns zeros for every requested rep with no records, never undefined", async () => {
    leadGroupBy.mockResolvedValue([]);
    prospectGroupBy.mockResolvedValue([]);
    oppGroupBy.mockResolvedValue([]);

    const out = await getRepCountsBulk("org-1", ["rep-1", "rep-2"], AUGUST);
    expect(out).toEqual({
      "rep-1": { leads: 0, prospects: 0, opportunities: 0, wonDeals: 0 },
      "rep-2": { leads: 0, prospects: 0, opportunities: 0, wonDeals: 0 },
    });
  });

  it("maps grouped aggregates back to the right rep", async () => {
    leadGroupBy.mockResolvedValue([
      { ownerId: "rep-1", _count: { _all: 100 } },
      { ownerId: "rep-2", _count: { _all: 200 } },
      // A rep not in the requested list must be ignored, not crash the mapping.
      { ownerId: "rep-99", _count: { _all: 7 } },
    ]);
    prospectGroupBy.mockResolvedValue([{ savedById: "rep-1", _count: { _all: 40 } }]);
    oppGroupBy
      .mockResolvedValueOnce([{ ownerId: "rep-1", _count: { _all: 10 } }])
      .mockResolvedValueOnce([{ ownerId: "rep-1", _count: { _all: 5 } }]);

    const out = await getRepCountsBulk("org-1", ["rep-1", "rep-2"], AUGUST);
    expect(out["rep-1"]).toEqual({
      leads: 100,
      prospects: 40,
      opportunities: 10,
      wonDeals: 5,
    });
    // rep-2 has leads but nothing else — the other three stay 0, not undefined.
    expect(out["rep-2"]).toEqual({
      leads: 200,
      prospects: 0,
      opportunities: 0,
      wonDeals: 0,
    });
    expect(out["rep-99"]).toBeUndefined();
  });

  it("issues no queries and returns an empty map for an org with no reps", async () => {
    const out = await getRepCountsBulk("org-1", [], AUGUST);
    expect(out).toEqual({});
    expect(leadGroupBy.mock.calls).toHaveLength(0);
  });
});
