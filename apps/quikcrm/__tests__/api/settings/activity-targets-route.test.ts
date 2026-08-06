/**
 * GET/PATCH /api/settings/activity-targets — admin-only (Super Admin / Org Admin /
 * CRM Administrator). Non-admins get 403; unauthenticated 401.
 *
 * isCrmAdminUser runs for real (pure). The config service is mocked so this is a
 * route-level test.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

mockDb();

vi.mock("@/lib/services/workspace/activity-target-config", () => ({
  getActivityTargetConfig: vi.fn(async () => ({
    defaultDailyTarget: 10,
    weeklyWorkingDays: 5,
    perUser: {},
  })),
  setActivityTargetConfig: vi.fn(async (_orgId: string, patch: unknown) => ({
    defaultDailyTarget: 10,
    weeklyWorkingDays: 5,
    perUser: {},
    ...(patch as object),
  })),
}));
import {
  getActivityTargetConfig,
  setActivityTargetConfig,
} from "@/lib/services/workspace/activity-target-config";

const ROUTE = "@/app/api/settings/activity-targets/route";

function req(method: string, body?: unknown) {
  return new Request("http://test/api/settings/activity-targets", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  setSession(null);
  vi.mocked(getActivityTargetConfig).mockClear();
  vi.mocked(setActivityTargetConfig).mockClear();
});

describe("GET /api/settings/activity-targets", () => {
  it("401 when unauthenticated", async () => {
    const { GET } = await import(ROUTE);
    expect((await GET(req("GET"))).status).toBe(401);
  });

  it("403 for a non-admin (SalesUser)", async () => {
    setSession({ userId: "u2", orgId: "t1", role: "SalesUser" });
    const { GET } = await import(ROUTE);
    const res = await GET(req("GET"));
    expect(res.status).toBe(403);
    expect(getActivityTargetConfig).not.toHaveBeenCalled();
  });

  it("403 for a Sales Manager (must be admin)", async () => {
    setSession({ userId: "u3", orgId: "t1", role: "SalesManager" });
    const { GET } = await import(ROUTE);
    expect((await GET(req("GET"))).status).toBe(403);
  });

  it("200 for an Administrator, scoped to their orgId", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
    const { GET } = await import(ROUTE);
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(getActivityTargetConfig).toHaveBeenCalledWith("t1");
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.defaultDailyTarget).toBe(10);
  });
});

describe("PATCH /api/settings/activity-targets", () => {
  it("403 for a non-admin (does not write)", async () => {
    setSession({ userId: "u2", orgId: "t1", role: "SalesUser" });
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(req("PATCH", { defaultDailyTarget: 20 }));
    expect(res.status).toBe(403);
    expect(setActivityTargetConfig).not.toHaveBeenCalled();
  });

  it("400 on invalid body (negative target)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
    const { PATCH } = await import(ROUTE);
    expect((await PATCH(req("PATCH", { defaultDailyTarget: -1 }))).status).toBe(400);
  });

  it("400 on invalid perUser shape (bare number no longer accepted)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
    const { PATCH } = await import(ROUTE);
    expect((await PATCH(req("PATCH", { perUser: { u9: 30 } }))).status).toBe(400);
  });

  it("admin write with assignment shape is scoped to their orgId", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
    const { PATCH } = await import(ROUTE);
    const perUser = { u9: { enabled: true, dailyTarget: 30 }, u8: { enabled: false } };
    const res = await PATCH(req("PATCH", { defaultDailyTarget: 20, perUser }));
    expect(res.status).toBe(200);
    expect(setActivityTargetConfig).toHaveBeenCalledWith("t1", { defaultDailyTarget: 20, perUser });
  });
});
