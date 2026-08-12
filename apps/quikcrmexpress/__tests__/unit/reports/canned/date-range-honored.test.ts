import { describe, expect, it, beforeEach, type Mock } from "vitest";
import { mockDb } from "../../../helpers/mockDb";
import { CANNED_REPORTS } from "@/lib/services/reports/canned";
import type { ReportRunContext } from "@/lib/services/reports/canned";

/**
 * Regression guard for W1: reports that previously hard-coded their own
 * window (last 7d / 14d / this month) must now honor the caller's selected
 * `from`/`to` range. We assert the lower bound passed to Prisma equals
 * `ctx.from`, not a self-computed cutoff.
 */
const db = mockDb();
const asMock = <T>(fn: T): Mock => fn as unknown as Mock;

const FROM = new Date("2026-04-01T00:00:00Z");
const TO = new Date("2026-05-01T00:00:00Z");

function ctx(overrides: Partial<ReportRunContext> = {}): ReportRunContext {
  return {
    orgId: "t1",
    session: {
      userId: "u1",
      orgId: "t1",
      role: "Administrator",
      email: "a@x.co",
      name: "A",
    },
    from: FROM,
    to: TO,
    tz: "UTC",
    ...overrides,
  };
}

function reportById(id: string) {
  const r = CANNED_REPORTS.find((c) => c.id === id);
  if (!r) throw new Error(`Report ${id} missing from catalog`);
  return r;
}

describe("reports honor the selected date range", () => {
  beforeEach(() => {
    asMock(db.qceCallLog.groupBy).mockReset();
    db.qceCallLog.findMany.mockReset();
    asMock(db.qceActivity.groupBy).mockReset();
  });

  it("calls-by-user filters createdAt from ctx.from (not a 7-day cutoff)", async () => {
    asMock(db.qceCallLog.groupBy).mockResolvedValueOnce([] as never);
    await reportById("calls-by-user").run(ctx());
    const where = asMock(db.qceCallLog.groupBy).mock.calls[0]?.[0].where as {
      createdAt: { gte: Date; lte: Date };
    };
    expect(where.createdAt.gte.getTime()).toBe(FROM.getTime());
    expect(where.createdAt.lte.getTime()).toBe(TO.getTime());
  });

  it("activity-leaderboard filters occurredAt from ctx.from", async () => {
    asMock(db.qceActivity.groupBy).mockResolvedValueOnce([] as never);
    await reportById("activity-leaderboard").run(ctx());
    const where = asMock(db.qceActivity.groupBy).mock.calls[0]?.[0].where as {
      occurredAt: { gte: Date; lte: Date };
    };
    expect(where.occurredAt.gte.getTime()).toBe(FROM.getTime());
    expect(where.occurredAt.lte.getTime()).toBe(TO.getTime());
  });

  it("calls-by-day pre-fills a bucket per day across the whole range", async () => {
    db.qceCallLog.findMany.mockResolvedValueOnce([] as never);
    const result = await reportById("calls-by-day").run(
      ctx({ from: new Date("2026-04-01T00:00:00Z"), to: new Date("2026-04-05T23:59:59Z") }),
    );
    // 2026-04-01 .. 2026-04-05 inclusive => 5 day buckets, all zero-filled.
    expect(result.rows).toHaveLength(5);
    expect(result.rows.every((r) => r.count === 0)).toBe(true);
  });
});
