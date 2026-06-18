import { describe, it, expect, vi, beforeEach } from "vitest";

// from-dpr.ts pulls `db` from @/lib/db (mocked via mockDb) and `boqService`
// from @/lib/boq. We mock @/lib/boq so getLeafItems returns controlled leaves.
const getLeafItems = vi.fn();
vi.mock("@/lib/boq", () => ({
  boqService: { getLeafItems: (...a: any[]) => getLeafItems(...a) },
}));

import { mockDb, resetMockDb } from "../helpers/mockDb";
import { aggregateFromDpr } from "@/lib/rab/from-dpr";

const db = mockDb as any;
const ctx: any = { orgId: "org-1", userId: "user-1" };

beforeEach(() => {
  resetMockDb();
  getLeafItems.mockReset();
});

function dec(n: number) {
  return { toString: () => String(n) };
}

/** A DPR row as returned by the select in from-dpr. */
function dpr(id: string, workItems: Array<{ boqItemId: string; todayQty: number; uomId?: string; description?: string }>) {
  return {
    id,
    dprNumber: `DPR-${id}`,
    reportDate: new Date("2026-06-10T00:00:00Z"),
    workItems: workItems.map((w) => ({
      boqItemId: w.boqItemId,
      todayQty: dec(w.todayQty),
      uomId: w.uomId ?? "uom-1",
      description: w.description ?? "",
    })),
  };
}

function leaf(over: Partial<any> = {}) {
  return {
    id: "boq-1",
    boq_no: "A.1.1",
    category: "civil",
    display_name: "Excavation",
    description: "desc",
    unit: "cum",
    rate: 100,
    done_qty: 100,
    billed_qty: 0,
    is_group: false,
    ...over,
  };
}

describe("aggregateFromDpr — empty period", () => {
  it("returns noDprs=true when there are no approved DPRs", async () => {
    db.cnDailyProgressReport.findMany.mockResolvedValue([]);
    const res = await aggregateFromDpr(ctx, "proj-1", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(res).toEqual({ lines: [], sources: [], total: "0", cappedLines: 0, noDprs: true });
    expect(getLeafItems).not.toHaveBeenCalled();
  });

  it("scopes the DPR query to org + project + approved + date range", async () => {
    db.cnDailyProgressReport.findMany.mockResolvedValue([]);
    const from = new Date("2026-06-01");
    const to = new Date("2026-06-30");
    await aggregateFromDpr(ctx, "proj-9", from, to);
    expect(db.cnDailyProgressReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org-1",
          projectId: "proj-9",
          status: "approved",
          reportDate: { gte: from, lte: to },
        }),
      }),
    );
  });
});

describe("aggregateFromDpr — happy path mapping", () => {
  it("proposes billQty = dprQty when under the un-billed balance; amount = qty*rate", async () => {
    db.cnDailyProgressReport.findMany.mockResolvedValue([dpr("1", [{ boqItemId: "boq-1", todayQty: 20 }])]);
    getLeafItems.mockResolvedValue([leaf({ done_qty: 100, billed_qty: 0, rate: 100 })]);

    const res = await aggregateFromDpr(ctx, "proj-1", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(res.noDprs).toBe(false);
    expect(res.lines).toHaveLength(1);
    const l = res.lines[0]!;
    expect(l.dprQty).toBe("20");
    expect(l.executedQty).toBe("100");
    expect(l.billedQty).toBe("0");
    expect(l.billableQty).toBe("100");
    expect(l.billQty).toBe("20");
    expect(l.amount).toBe("2000");
    expect(l.capped).toBe(false);
    expect(res.total).toBe("2000");
    expect(res.cappedLines).toBe(0);
  });

  it("aggregates todayQty for the same BOQ item across multiple DPRs", async () => {
    db.cnDailyProgressReport.findMany.mockResolvedValue([
      dpr("1", [{ boqItemId: "boq-1", todayQty: 15 }]),
      dpr("2", [{ boqItemId: "boq-1", todayQty: 10 }]),
    ]);
    getLeafItems.mockResolvedValue([leaf({ done_qty: 100, billed_qty: 0 })]);
    const res = await aggregateFromDpr(ctx, "proj-1", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(res.lines[0]!.dprQty).toBe("25");
    expect(res.lines[0]!.billQty).toBe("25");
    expect(res.sources).toHaveLength(2);
  });

  it("lists only DPRs that contributed a non-zero line as sources", async () => {
    db.cnDailyProgressReport.findMany.mockResolvedValue([
      dpr("1", [{ boqItemId: "boq-1", todayQty: 10 }]),
      dpr("2", [{ boqItemId: "ghost", todayQty: 10 }]), // leaf not found → no line
    ]);
    getLeafItems.mockResolvedValue([leaf({ id: "boq-1", done_qty: 100, billed_qty: 0 })]);
    const res = await aggregateFromDpr(ctx, "proj-1", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(res.lines).toHaveLength(1);
    expect(res.sources.map((s) => s.id)).toEqual(["1"]);
    expect(res.sources[0]!.reportDate).toBe("2026-06-10");
  });
});

describe("aggregateFromDpr — the clamp guard against double-billing", () => {
  it("caps billQty to the un-billed balance and flags capped", async () => {
    // executed 100, billed 90 => remaining 10; dpr proposes 30 => clamp to 10
    db.cnDailyProgressReport.findMany.mockResolvedValue([dpr("1", [{ boqItemId: "boq-1", todayQty: 30 }])]);
    getLeafItems.mockResolvedValue([leaf({ done_qty: 100, billed_qty: 90, rate: 50 })]);
    const res = await aggregateFromDpr(ctx, "proj-1", new Date("2026-06-01"), new Date("2026-06-30"));
    const l = res.lines[0]!;
    expect(l.billQty).toBe("10");
    expect(l.capped).toBe(true);
    expect(l.amount).toBe("500"); // 10 * 50
    expect(res.cappedLines).toBe(1);
  });

  it("drops a line entirely when fully billed (remaining 0)", async () => {
    db.cnDailyProgressReport.findMany.mockResolvedValue([dpr("1", [{ boqItemId: "boq-1", todayQty: 5 }])]);
    getLeafItems.mockResolvedValue([leaf({ done_qty: 50, billed_qty: 50 })]);
    const res = await aggregateFromDpr(ctx, "proj-1", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(res.lines).toHaveLength(0);
    expect(res.sources).toHaveLength(0);
    expect(res.total).toBe("0");
  });

  it("never proposes a negative billQty when billed > executed", async () => {
    db.cnDailyProgressReport.findMany.mockResolvedValue([dpr("1", [{ boqItemId: "boq-1", todayQty: 5 }])]);
    getLeafItems.mockResolvedValue([leaf({ done_qty: 10, billed_qty: 40 })]); // remaining -30
    const res = await aggregateFromDpr(ctx, "proj-1", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(res.lines).toHaveLength(0); // billQty clamps to 0 and the line is dropped
  });

  it("skips work items with non-positive todayQty", async () => {
    db.cnDailyProgressReport.findMany.mockResolvedValue([
      dpr("1", [
        { boqItemId: "boq-1", todayQty: 0 },
        { boqItemId: "boq-1", todayQty: -5 },
      ]),
    ]);
    getLeafItems.mockResolvedValue([leaf({ done_qty: 100, billed_qty: 0 })]);
    const res = await aggregateFromDpr(ctx, "proj-1", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(res.lines).toHaveLength(0);
  });

  it("skips items whose BOQ leaf no longer exists / is a group", async () => {
    db.cnDailyProgressReport.findMany.mockResolvedValue([dpr("1", [{ boqItemId: "missing", todayQty: 10 }])]);
    getLeafItems.mockResolvedValue([leaf({ id: "boq-1" })]);
    const res = await aggregateFromDpr(ctx, "proj-1", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(res.lines).toHaveLength(0);
  });
});
