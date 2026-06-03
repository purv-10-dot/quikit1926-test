import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, setSession } from "../../helpers/mockDb";

vi.mock("@/lib/services/dashboard/executive-overview-service", () => ({
  buildExecutiveOverview: vi.fn(async () => ({
    range: { fromIso: "2026-01-01", toIso: "2026-01-31", tz: "UTC" },
    filters: { ownerId: null, source: null },
    executiveKpis: {},
    activitySummary: {},
    activityTrend: [],
    activityMix: { total: 0 },
    funnel: [],
    pipelineHealth: { stages: [] },
    insights: [],
    leaderboard: [],
    channels: [],
    revenueTrend: [],
    atRiskDeals: [],
    liveFeed: [],
    taskMonitor: {},
    usage: [],
    topCustomers: [],
    advanced: {
      todaySnapshot: [],
      adoption: [],
      inactiveUsers: [],
      followUpCompliance: { totalAssigned: 0, completedOnTime: 0, completedLate: 0, overdue: 0, missed: 0, compliancePct: 100 },
      leadAging: [],
      slaBreaches: [],
      approvalCenter: { pending: 0, approved: 0, rejected: 0, rows: [] },
      teamHeatmap: [],
      workload: [],
      customerEngagement: { contactedThisWeek: 0, withoutActivity30d: 0, upcomingRenewals: 0, customerMeetings: 0, openSupportIssues: 0, healthScore: 0 },
      executiveAlerts: [],
      filters: {},
    },
  })),
}));

const db = mockDb();

describe("GET /api/dashboard/executive-overview", () => {
  beforeEach(() => {
    setSession(null);
    db.crmLead.count.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/dashboard/executive-overview/route");
    const res = await GET(
      new NextRequest("http://test/api/dashboard/executive-overview", {
        headers: { "X-Client-TZ": "UTC" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    const { GET } = await import("@/app/api/dashboard/executive-overview/route");
    const res = await GET(
      new NextRequest("http://test/api/dashboard/executive-overview?from=2026-01-01&to=2026-01-31", {
        headers: { "X-Client-TZ": "UTC" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 for administrators", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
    const { GET } = await import("@/app/api/dashboard/executive-overview/route");
    const res = await GET(
      new NextRequest("http://test/api/dashboard/executive-overview?from=2026-01-01&to=2026-01-31", {
        headers: { "X-Client-TZ": "UTC" },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.filters).toBeDefined();
  });
});
