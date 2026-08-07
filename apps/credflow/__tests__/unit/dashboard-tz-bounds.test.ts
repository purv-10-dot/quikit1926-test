/**
 * Bug 5 regression test — TZ-aware today-bounds for activitiesToday.
 *
 * summary-service.ts used to build today's start with `new Date()` +
 * `setHours(0,0,0,0)` (server-local). On Vercel (UTC) an IST user saw
 * "today" start at 05:30 IST. Now buildSummary uses startOfDayInTz /
 * endOfDayInTz parameterised by `range.tz`.
 *
 * Strategy: stub the system clock to a deterministic UTC instant, run
 * buildSummary with three IANA zones, and inspect the args sent to
 * prisma.qcfActivity.count to find the "today" call. The today call is
 * uniquely identified by its `gte` matching startOfDayInTz(now, tz).
 */
import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type { Mock } from "vitest";
import { mockDb } from "../helpers/mockDb";
import { startOfDayInTz, endOfDayInTz } from "@/lib/services/dashboard/period";

const db = mockDb();

type AnyMock = Mock<(...args: unknown[]) => unknown>;
const asMock = (fn: unknown): AnyMock => fn as unknown as AnyMock;

// 2026-05-08 03:00 UTC = 08:30 IST (May 8) = 20:00 PDT (May 7).
// Far enough from a UTC day boundary that all three TZs disagree on the
// calendar day.
const FAKE_NOW = new Date("2026-05-08T03:00:00Z");

const RANGE_BASE = {
  from: new Date("2026-05-01T00:00:00Z"),
  to: new Date("2026-05-08T23:59:59.999Z"),
};
const USER = { userId: "u1", tenantId: "t1", role: "SalesUser" };

function armPrismaDefaults(): void {
  db.qcfLead.count.mockResolvedValue(0);
  asMock(db.qcfLead.groupBy).mockResolvedValue([]);
  db.qcfAccount.count.mockResolvedValue(0);
  db.qcfOpportunity.count.mockResolvedValue(0);
  asMock(db.qcfOpportunity.groupBy).mockResolvedValue([]);
  db.qcfTask.count.mockResolvedValue(0);
  db.qcfActivity.count.mockResolvedValue(0);
  db.qcfOrgWorkspaceSettings.findUnique.mockResolvedValue(null as never);
}

type ActivityCountArgs = {
  where: { occurredAt?: { gte?: Date; lte?: Date } };
};

function findTodayCall(
  expectedStart: Date,
): ActivityCountArgs | undefined {
  const calls = (db.qcfActivity.count as AnyMock).mock.calls;
  return calls
    .map((c) => c[0] as ActivityCountArgs | undefined)
    .find(
      (args) =>
        args?.where?.occurredAt?.gte instanceof Date &&
        args.where.occurredAt.gte.getTime() === expectedStart.getTime(),
    );
}

describe("Bug 5 — activitiesToday uses tz-aware day bounds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
    armPrismaDefaults();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Asia/Kolkata: today is the IST calendar day, not the UTC one", async () => {
    const tz = "Asia/Kolkata";
    const expectedStart = startOfDayInTz(FAKE_NOW, tz);
    const expectedEnd = endOfDayInTz(FAKE_NOW, tz);

    // Sanity-pin: at FAKE_NOW=03:00 UTC May 8, IST calendar is May 8;
    // its midnight is 18:30 UTC May 7.
    expect(expectedStart.toISOString()).toBe("2026-05-07T18:30:00.000Z");
    expect(expectedEnd.toISOString()).toBe("2026-05-08T18:29:59.999Z");

    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, {
      range: { ...RANGE_BASE, tz },
      resolvedOwnerId: null,
      ownerId: null,
    } as never);

    const todayCall = findTodayCall(expectedStart);
    expect(todayCall).toBeDefined();
    expect(todayCall!.where.occurredAt!.lte!.getTime()).toBe(
      expectedEnd.getTime(),
    );
  });

  it("America/Los_Angeles: today is the PT calendar day", async () => {
    const tz = "America/Los_Angeles";
    const expectedStart = startOfDayInTz(FAKE_NOW, tz);
    const expectedEnd = endOfDayInTz(FAKE_NOW, tz);

    // Sanity-pin: at FAKE_NOW=03:00 UTC May 8, PT (UTC-7 PDT) calendar
    // is still May 7; its midnight is 07:00 UTC May 7.
    expect(expectedStart.toISOString()).toBe("2026-05-07T07:00:00.000Z");
    expect(expectedEnd.toISOString()).toBe("2026-05-08T06:59:59.999Z");

    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, {
      range: { ...RANGE_BASE, tz },
      resolvedOwnerId: null,
      ownerId: null,
    } as never);

    const todayCall = findTodayCall(expectedStart);
    expect(todayCall).toBeDefined();
    expect(todayCall!.where.occurredAt!.lte!.getTime()).toBe(
      expectedEnd.getTime(),
    );
  });

  it("UTC: regression sanity — no double-shift, today is the UTC day", async () => {
    const tz = "UTC";
    const expectedStart = startOfDayInTz(FAKE_NOW, tz);
    const expectedEnd = endOfDayInTz(FAKE_NOW, tz);

    expect(expectedStart.toISOString()).toBe("2026-05-08T00:00:00.000Z");
    expect(expectedEnd.toISOString()).toBe("2026-05-08T23:59:59.999Z");

    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, {
      range: { ...RANGE_BASE, tz },
      resolvedOwnerId: null,
      ownerId: null,
    } as never);

    const todayCall = findTodayCall(expectedStart);
    expect(todayCall).toBeDefined();
    expect(todayCall!.where.occurredAt!.lte!.getTime()).toBe(
      expectedEnd.getTime(),
    );
  });
});
