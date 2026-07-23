/**
 * GET /api/dashboard/activity-target-tracker — admin-only.
 * 401 unauthenticated, 403 non-admin, 200 admin with { success, data }.
 * The tracker service is mocked (route-level test).
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

mockDb();

vi.mock("@/lib/services/dashboard/activity-target-tracker-service", () => ({
  getActivityTargetTracker: vi.fn(async () => ({
    defaultDailyTarget: 10,
    weeklyWorkingDays: 5,
    rows: [
      { userId: "u1", name: "A", email: null, dailyTarget: 10, todayActivities: 2, remaining: 8, completionPct: 20, weeklyTarget: 50, weeklyActivities: 5, status: "red" },
    ],
  })),
}));
import { getActivityTargetTracker } from "@/lib/services/dashboard/activity-target-tracker-service";

const ROUTE = "@/app/api/dashboard/activity-target-tracker/route";

function req() {
  return new Request("http://test/api/dashboard/activity-target-tracker", {
    headers: { "x-client-tz": "Asia/Kolkata" },
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  setSession(null);
  vi.mocked(getActivityTargetTracker).mockClear();
});

describe("GET /api/dashboard/activity-target-tracker", () => {
  it("401 when unauthenticated", async () => {
    const { GET } = await import(ROUTE);
    expect((await GET(req())).status).toBe(401);
  });

  it("403 for a non-admin (SalesManager)", async () => {
    setSession({ userId: "u2", orgId: "t1", role: "SalesManager" });
    const { GET } = await import(ROUTE);
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(getActivityTargetTracker).not.toHaveBeenCalled();
  });

  it("200 for an Administrator, org-scoped with client tz", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
    const { GET } = await import(ROUTE);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(getActivityTargetTracker).toHaveBeenCalledWith("t1", "Asia/Kolkata");
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.rows[0].status).toBe("red");
  });
});
