/**
 * Bug 1 regression test — flow vs stock KPI semantics.
 *
 * Pre-fix, every KPI used `createdAt: { lte: range.to }` only, ignoring
 * `from`. The dashboard date-range chip silently failed to gate stock
 * counts (Accounts, Open tasks, Pipeline, Open opportunities) and
 * misreported flow counts (Total Leads, Leads-by-stage) as cumulative
 * snapshots.
 *
 * After fix:
 *   FLOW  → where contains createdAt with BOTH gte and lte.
 *   STOCK → where has NO createdAt key at all.
 *
 * The dto's `kpis` block carries deltas only for flow KPIs; stock
 * KPIs are absent so the UI cannot render a misleading delta pill.
 *
 * UPDATE (Option A, 2026-08-17): the flow-vs-stock split was reversed by
 * product decision — the dashboard must respond to the date filter on EVERY
 * card. The former "stock KPIs have NO createdAt" block is superseded by
 * "Option A — every summary KPI is windowed by the selected range" below.
 * The FLOW assertions are unchanged and still valid.
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { mockDb } from "../helpers/mockDb";

const db = mockDb();

type AnyMock = Mock<(...args: unknown[]) => unknown>;
const asMock = (fn: unknown): AnyMock => fn as unknown as AnyMock;

const RANGE = {
  from: new Date("2026-04-25T00:00:00Z"),
  to: new Date("2026-05-01T23:59:59.999Z"),
  tz: "UTC",
};
// Administrator → org-wide scope ({ orgId }) so this suite pins flow/stock KPI
// (createdAt) semantics, not RBAC scoping (covered by the dashboard-rbac suite).
const USER = { userId: "u1", orgId: "t1", role: "Administrator" };
const FILTERS = { range: RANGE, resolvedOwnerId: null, ownerId: null };

function armPrismaDefaults(): void {
  db.crmLead.count.mockResolvedValue(0);
  asMock(db.crmLead.groupBy).mockResolvedValue([]);
  db.crmAccount.count.mockResolvedValue(0);
  db.crmOpportunity.count.mockResolvedValue(0);
  asMock(db.crmOpportunity.groupBy).mockResolvedValue([]);
  db.crmTask.count.mockResolvedValue(0);
  db.crmActivity.count.mockResolvedValue(0);
  db.crmOrgWorkspaceSettings.findUnique.mockResolvedValue(null as never);
}

type WhereCarrier = { where?: Record<string, unknown> };
function whereArgs(mock: unknown): Record<string, unknown>[] {
  const m = mock as AnyMock;
  return m.mock.calls
    .map((call) => (call[0] as WhereCarrier | undefined)?.where ?? {})
    .filter((w) => Object.keys(w).length > 0);
}

function hasFlowCreatedAt(w: Record<string, unknown>): boolean {
  const c = w.createdAt as Record<string, unknown> | undefined;
  return !!c && "gte" in c && "lte" in c;
}

describe("Bug 1 — flow KPIs are period-bound", () => {
  beforeEach(() => {
    armPrismaDefaults();
  });

  it("CrmLead.count passes createdAt with both gte AND lte", async () => {
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmLead.count);
    expect(wheres.length).toBe(2); // current + prior
    for (const w of wheres) expect(hasFlowCreatedAt(w)).toBe(true);
  });

  it("CrmLead.groupBy (leads-by-stage) passes createdAt gte+lte", async () => {
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmLead.groupBy);
    expect(wheres.length).toBe(1);
    expect(hasFlowCreatedAt(wheres[0])).toBe(true);
  });

  it("CrmActivity.count passes occurredAt gte+lte (already correct, regression-pin)", async () => {
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmActivity.count);
    expect(wheres.length).toBeGreaterThan(0);
    // occurredAt drives activities, not createdAt.
    const flowWheres = wheres.filter((w) => "occurredAt" in w);
    expect(flowWheres.length).toBeGreaterThan(0);
    for (const w of flowWheres) {
      const o = w.occurredAt as Record<string, unknown> | undefined;
      expect(o && "gte" in o && "lte" in o).toBe(true);
      expect("createdAt" in w).toBe(false);
    }
  });
});

// SUPERSEDES the original "Bug 1 — stock KPIs have NO createdAt clause" block.
//
// Option A (product decision 2026-08-17) reversed the flow-vs-stock split: the
// dashboard must be fully filter-responsive, so accounts / open tasks / open
// opportunities / pipeline are now WINDOWED by the selected range instead of
// being all-time snapshots. These tests pin the new contract.
describe("Option A — every summary KPI is windowed by the selected range", () => {
  beforeEach(() => {
    armPrismaDefaults();
  });

  it("CrmAccount.count IS bounded by createdAt", async () => {
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmAccount.count);
    expect(wheres.length).toBe(1); // no prior-period query for accounts
    for (const w of wheres) expect("createdAt" in w).toBe(true);
  });

  it("CrmTask.count IS bounded by createdAt", async () => {
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmTask.count);
    // The open-tasks KPI windows. The my-work-today rows are deliberately
    // anchored to TODAY via dueDate (not createdAt) — see executive-metrics.
    const windowed = wheres.filter((w) => "createdAt" in w);
    expect(windowed.length).toBeGreaterThan(0);
  });

  it("CrmOpportunity.count (open opps) IS bounded by createdAt", async () => {
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmOpportunity.count);
    // open-opps (createdAt-windowed) + won-count current & prior (won-date rule).
    expect(wheres.some((w) => "createdAt" in w)).toBe(true);
  });

  it("CrmOpportunity.groupBy (pipeline + opps-by-stage) IS bounded by createdAt", async () => {
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, FILTERS as never);
    const wheres = whereArgs(db.crmOpportunity.groupBy);
    // pipeline-by-currency + opps-by-stage (both windowed) + the won-revenue
    // per-currency sum (windowed on the won-date rule, not createdAt).
    expect(wheres.filter((w) => "createdAt" in w).length).toBeGreaterThanOrEqual(2);
  });

  it("won-revenue aggregation uses closeDate → lastStageChangeAt, never updatedAt", async () => {
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    await buildSummary(USER as never, FILTERS as never);
    const all = JSON.stringify([
      ...whereArgs(db.crmOpportunity.groupBy),
      ...whereArgs(db.crmOpportunity.count),
      ...whereArgs(db.crmOpportunity.findMany),
    ]);
    expect(all).toContain("closeDate");
    expect(all).toContain("lastStageChangeAt");
    expect(all).not.toContain("updatedAt");
  });
});

describe("Bug 1 — conversionLeadToQualifiedPct empty-window guard", () => {
  beforeEach(() => {
    armPrismaDefaults();
  });

  it("is null when leadsByStage is empty (no leads in window)", async () => {
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    // armPrismaDefaults() already returns [] for crmLead.groupBy.
    const summary = await buildSummary(USER as never, FILTERS as never);
    expect(summary.conversionLeadToQualifiedPct).toBeNull();
  });

  it("is a rounded percentage when leadsByStage has rows", async () => {
    asMock(db.crmLead.groupBy).mockResolvedValue([
      { stage: "New", _count: 8 },
      { stage: "Qualified", _count: 2 },
    ]);
    db.crmOrgWorkspaceSettings.findUnique.mockResolvedValue({
      orgId: "t1",
      settings: {
        dashboard: { qualifiedStages: ["Qualified"], funnelStages: ["New"] },
      },
    } as never);
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    const summary = await buildSummary(USER as never, FILTERS as never);
    // 2 qualified out of 10 total = 20%
    expect(summary.conversionLeadToQualifiedPct).toBe(20);
  });
});

describe("Bug 1 — DTO carries deltas for flow only", () => {
  beforeEach(() => {
    armPrismaDefaults();
  });

  it("populates kpis.leadCount and kpis.activities with priorValue", async () => {
    db.crmLead.count.mockResolvedValueOnce(7).mockResolvedValueOnce(3);
    db.crmActivity.count.mockResolvedValue(0);
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    const summary = await buildSummary(USER as never, FILTERS as never);
    // Delta shape changed in Bug 6: tagged union instead of bare number.
    expect(summary.kpis.leadCount).toEqual({
      value: 7,
      priorValue: 3,
      delta: { kind: "pct", value: expect.any(Number) },
    });
    expect(summary.kpis.activities).toMatchObject({
      value: expect.any(Number),
      priorValue: expect.any(Number),
      delta: expect.objectContaining({ kind: expect.any(String) }),
    });
  });

  it("does NOT populate stock-KPI keys in kpis block", async () => {
    const { buildSummary } = await import(
      "@/lib/services/dashboard/summary-service"
    );
    const summary = await buildSummary(USER as never, FILTERS as never);
    const k = summary.kpis as Record<string, unknown>;
    expect("pipelineOpen" in k).toBe(false);
    expect("openTasks" in k).toBe(false);
    expect("accountCount" in k).toBe(false);
    expect("openOpportunityCount" in k).toBe(false);
  });
});
