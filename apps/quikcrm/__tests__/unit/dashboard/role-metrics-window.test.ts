/**
 * (i)+§1 bundle — RED (B, unit-level): optional range window + activityByRep on
 * buildRoleMetrics. REAL RED→GREEN: neither the range param nor activityByRep
 * exists yet.
 *
 * KEYSTONE CONTRACT (the regression guard's whole point):
 *   - range OMITTED → the activity `where` is BYTE-IDENTICAL to today (NO
 *     occurredAt key at all — not occurredAt:undefined). This is what keeps
 *     FR-4.1 / FR-4.2 (which assert the where by strict deep-equality) green
 *     UNTOUCHED. If those need editing, the design is wrong.
 *   - range PASSED → the SAME tier scope where PLUS occurredAt: { gte, lt }.
 *     Scope is unchanged; the window is an ADDITIONAL filter, never a replacement.
 *
 * PARTIAL-WINDOWING CONTRACT (documented, loud): range windows ACTIVITY fields
 * ONLY (count, by-type, by-rep). Leads/opps/tasks/quotes remain all-time. This
 * test pins that activity counts window while a non-activity count (leads) does
 * NOT — so a future caller can't assume the whole DTO windows.
 *
 * activityByRep: per-rep TRUE activity volume (the §1 fix), grouped by ownerId on
 * the SAME tier scope where (single-sourced, leak-safe), ownerName denormalized.
 *
 * Mock-level: prisma mocked; we assert the where passed to crmActivity.count /
 * groupBy. The windowed $queryRaw real-DB proof is the separate 2×2 gate (C).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";

vi.mock("@/lib/auth/account-acl", () => ({ accountScopeFilter: vi.fn(), getScope: vi.fn() }));
vi.mock("@/lib/services/dashboard/team", () => ({ resolveManagerTeam: vi.fn(), resolveTeamScope: vi.fn() }));

import { accountScopeFilter, getScope } from "@/lib/auth/account-acl";
import { resolveManagerTeam } from "@/lib/services/dashboard/team";
import { buildRoleMetrics } from "@/lib/services/dashboard/role-metrics";

function user(role: string) {
  return { userId: "u1", orgId: "t1", role, email: "u@x.co", name: "U" } as never;
}

const groupByMock = prismaMock.crmActivity.groupBy as unknown as { mockResolvedValue: (v: unknown) => void; mock: { calls: { 0: { by: string[]; where: unknown } }[] } };

function activityCountWheres() {
  return prismaMock.crmActivity.count.mock.calls.map((c) => (c[0] as { where: unknown })?.where);
}
function leadCountWheres() {
  return prismaMock.crmLead.count.mock.calls.map((c) => (c[0] as { where: unknown })?.where);
}
// the by-ownerId groupBy (activityByRep) — distinct from the by-type groupBy
function byRepGroupByCalls() {
  return groupByMock.mock.calls.filter((c) => Array.isArray(c[0]?.by) && c[0].by.includes("ownerId"));
}

const RANGE = { from: new Date("2026-06-23T00:00:00Z"), to: new Date("2026-06-24T00:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of [
    prismaMock.crmActivity.count, prismaMock.crmTask.count, prismaMock.crmLead.count,
    prismaMock.crmAccount.count, prismaMock.crmContact.count, prismaMock.crmQuote.count,
    prismaMock.crmOpportunity.count,
  ]) (m as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(0 as never);
  prismaMock.crmOpportunity.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
  prismaMock.crmOpportunity.findMany.mockResolvedValue([] as never);
  groupByMock.mockResolvedValue([]);
  vi.mocked(accountScopeFilter).mockResolvedValue(null as never);
  vi.mocked(getScope).mockResolvedValue({ unrestricted: true } as never);
  vi.mocked(resolveManagerTeam).mockResolvedValue(null as never);
});

describe("(i) — buildRoleMetrics optional range window (KEYSTONE)", () => {
  it("range OMITTED → activity count where has NO occurredAt key (byte-identical to today)", async () => {
    await buildRoleMetrics(user("Administrator"));
    const wheres = activityCountWheres();
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) {
      expect(w).not.toHaveProperty("occurredAt");
    }
    // Admin scope unchanged
    expect(wheres).toContainEqual({ orgId: "t1" });
  });

  it("range PASSED → activity count where = same scope PLUS occurredAt:{gte,lt}", async () => {
    await buildRoleMetrics(user("Administrator"), RANGE);
    const wheres = activityCountWheres();
    expect(wheres).toContainEqual({ orgId: "t1", occurredAt: { gte: RANGE.from, lt: RANGE.to } });
  });

  it("PARTIAL-WINDOWING: a non-activity count (leads) stays all-time even WITH a range", async () => {
    await buildRoleMetrics(user("Administrator"), RANGE);
    for (const w of leadCountWheres()) {
      expect(w).not.toHaveProperty("occurredAt");
      // Default mode must not introduce a createdAt bound either — this is the
      // contract the daily digest depends on.
      expect(JSON.stringify(w)).not.toContain("createdAt");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// windowAllMetrics — the DASHBOARD's explicit opt-in to full windowing.
// The default mode above (used by the daily digest) is unaffected.
// ─────────────────────────────────────────────────────────────────────────────
describe("windowAllMetrics — full windowing (dashboard mode)", () => {
  it("windowAllMetrics + range → the lead count IS bounded by createdAt", async () => {
    await buildRoleMetrics(user("Administrator"), RANGE, { windowAllMetrics: true });
    const wheres = leadCountWheres();
    expect(wheres.length).toBeGreaterThan(0);
    expect(
      wheres.some((w) =>
        JSON.stringify(w).includes(`"createdAt":{"gte":"${RANGE.from.toISOString()}"`),
      ),
    ).toBe(true);
  });

  it("windowAllMetrics windows accounts, contacts, tasks and quotes too", async () => {
    await buildRoleMetrics(user("Administrator"), RANGE, { windowAllMetrics: true });
    for (const m of [
      prismaMock.crmAccount.count,
      prismaMock.crmContact.count,
      prismaMock.crmTask.count,
      prismaMock.crmQuote.count,
    ]) {
      const calls = (m as unknown as { mock: { calls: { 0: { where: unknown } }[] } }).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) {
        expect(JSON.stringify(c[0].where)).toContain("createdAt");
      }
    }
  });

  it("won revenue uses closeDate → lastStageChangeAt (NEVER updatedAt)", async () => {
    await buildRoleMetrics(user("Administrator"), RANGE, { windowAllMetrics: true });
    const aggCalls = prismaMock.crmOpportunity.aggregate.mock.calls;
    expect(aggCalls.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(aggCalls.map((c) => (c[0] as { where: unknown }).where));
    expect(serialized).toContain("closeDate");
    expect(serialized).toContain("lastStageChangeAt");
    expect(serialized).not.toContain("updatedAt");
  });

  it("NO range + windowAllMetrics → no-op (cannot window without bounds)", async () => {
    await buildRoleMetrics(user("Administrator"), undefined, { windowAllMetrics: true });
    for (const w of leadCountWheres()) {
      expect(JSON.stringify(w)).not.toContain("createdAt");
    }
  });
});

describe("ownerId — Owner dropdown plumbed through buildRoleMetrics", () => {
  it("Administrator + ownerId → every record where narrows to that owner", async () => {
    await buildRoleMetrics(user("Administrator"), undefined, { ownerId: "rep-9" });
    expect(JSON.stringify(leadCountWheres())).toContain('"ownerId":"rep-9"');
    expect(JSON.stringify(activityCountWheres())).toContain('"ownerId":"rep-9"');
  });

  it("date + owner combine: both clauses present on the same query", async () => {
    await buildRoleMetrics(user("Administrator"), RANGE, {
      windowAllMetrics: true,
      ownerId: "rep-9",
    });
    const s = JSON.stringify(leadCountWheres());
    expect(s).toContain('"ownerId":"rep-9"');
    expect(s).toContain("createdAt");
  });

  it("SalesUser + FOREIGN ownerId → intersected to __none__, never widened", async () => {
    await buildRoleMetrics(user("SalesUser"), undefined, { ownerId: "somebody-else" });
    const s = JSON.stringify(leadCountWheres());
    expect(s).toContain("__none__");
    expect(s).not.toContain("somebody-else");
  });

  it("SalesUser + OWN ownerId → still scoped to self (no sentinel)", async () => {
    await buildRoleMetrics(user("SalesUser"), undefined, { ownerId: "u1" });
    const s = JSON.stringify(leadCountWheres());
    expect(s).toContain('"ownerId":"u1"');
    expect(s).not.toContain("__none__");
  });

  it("no ownerId → where carries no ownerId narrowing (Admin org-wide)", async () => {
    await buildRoleMetrics(user("Administrator"));
    expect(activityCountWheres()).toContainEqual({ orgId: "t1" });
  });
});

describe("§1 — buildRoleMetrics activityByRep (per-rep TRUE activity volume)", () => {
  it("Administrator → activityByRep present, grouped by ownerId on org scope", async () => {
    groupByMock.mockResolvedValue([
      { ownerId: "r1", ownerName: "Rep One", _count: { _all: 7 } },
      { ownerId: "r2", ownerName: "Rep Two", _count: { _all: 3 } },
    ]);
    const res = await buildRoleMetrics(user("Administrator"));
    const m = res.metrics as { activityByRep?: { ownerId: string; ownerName: string | null; count: number }[] };
    expect(m.activityByRep).toEqual(
      expect.arrayContaining([
        { ownerId: "r1", ownerName: "Rep One", count: 7 },
        { ownerId: "r2", ownerName: "Rep Two", count: 3 },
      ]),
    );
  });

  it("activityByRep groupBy uses by:['ownerId'] on the tier scope + windows with range", async () => {
    await buildRoleMetrics(user("Administrator"), RANGE);
    const calls = byRepGroupByCalls();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some((c) => {
      const w = c[0].where as Record<string, unknown>;
      return w.orgId === "t1" && JSON.stringify(w.occurredAt) === JSON.stringify({ gte: RANGE.from, lt: RANGE.to });
    })).toBe(true);
  });

  it("activityByRep by-rep groupBy where has NO occurredAt when range omitted", async () => {
    await buildRoleMetrics(user("Administrator"));
    for (const c of byRepGroupByCalls()) {
      expect(c[0].where).not.toHaveProperty("occurredAt");
    }
  });
});
