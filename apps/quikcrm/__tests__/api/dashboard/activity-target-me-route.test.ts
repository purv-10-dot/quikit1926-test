/**
 * GET /api/activity-target/me — self-service.
 * - 401 unauthenticated.
 * - Always calls the service with the SESSION's own userId (no userId param),
 *   so a caller can never read another user's data.
 * - Passes { assigned:false } through unchanged for an unassigned user.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

mockDb();

vi.mock("@/lib/services/dashboard/my-activity-target-service", () => ({
  getMyActivityTarget: vi.fn(async () => ({ assigned: false })),
}));
import { getMyActivityTarget } from "@/lib/services/dashboard/my-activity-target-service";

const ROUTE = "@/app/api/activity-target/me/route";

function req() {
  return new Request("http://test/api/activity-target/me", {
    headers: { "x-client-tz": "Asia/Kolkata" },
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  setSession(null);
  vi.mocked(getMyActivityTarget).mockClear();
  vi.mocked(getMyActivityTarget).mockResolvedValue({ assigned: false } as never);
});

describe("GET /api/activity-target/me", () => {
  it("401 when unauthenticated", async () => {
    const { GET } = await import(ROUTE);
    expect((await GET(req())).status).toBe(401);
    expect(getMyActivityTarget).not.toHaveBeenCalled();
  });

  it("always scopes to the caller's OWN userId + orgId + tz", async () => {
    setSession({ userId: "self-1", orgId: "t1", role: "SalesUser" });
    const { GET } = await import(ROUTE);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(getMyActivityTarget).toHaveBeenCalledWith("t1", "self-1", "Asia/Kolkata");
  });

  it("passes { assigned:false } through for an unassigned user", async () => {
    setSession({ userId: "u2", orgId: "t1", role: "SalesUser" });
    const { GET } = await import(ROUTE);
    const res = await GET(req());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ assigned: false });
  });

  it("returns assigned data when the service reports assigned", async () => {
    setSession({ userId: "u3", orgId: "t1", role: "SalesUser" });
    vi.mocked(getMyActivityTarget).mockResolvedValue({
      assigned: true, dailyTarget: 4, todayActivities: 3, remaining: 1, completionPct: 75,
      weeklyTarget: 20, weeklyActivities: 12, status: "red",
      breakdown: { calls: 1, activities: 1, completedTasks: 1, total: 3, weekTotal: 12 },
      recentToday: [],
    } as never);
    const { GET } = await import(ROUTE);
    const body = await (await GET(req())).json();
    expect(body.data.assigned).toBe(true);
    expect(body.data.status).toBe("red");
  });
});
