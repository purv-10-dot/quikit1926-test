/**
 * GET/PATCH /api/settings/activity-type-targets — Activity Type-wise daily
 * targets. Admin-only (Super Admin / Org Admin / CRM Administrator); non-admins
 * get 403, unauthenticated 401.
 *
 * isCrmAdminUser runs for real (pure). The config service is mocked so this
 * stays a route-level test; org scoping is asserted by checking that every
 * service call receives the SESSION's orgId, never a client-supplied one.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

vi.mock("@/lib/services/activity-types/ensure-defaults", () => ({
  ensureDefaultActivityTypes: vi.fn(async () => undefined),
}));

vi.mock("@/lib/services/workspace/activity-type-target-config", () => ({
  listActiveTargetableTypes: vi.fn(async () => [
    { id: "at1", code: "call", label: "Call", sortOrder: 0, config: { countsSources: ["activity", "call"] } },
    { id: "at2", code: "meeting", label: "Meeting", sortOrder: 1, config: null },
  ]),
  getActivityTypeTargetsForUsers: vi.fn(async () => new Map()),
  setActivityTypeTargets: vi.fn(async () => 2),
  readCountSources: (config: unknown) => {
    const raw = (config as { countsSources?: string[] } | null)?.countsSources;
    return Array.isArray(raw) ? raw : ["activity"];
  },
}));
import {
  listActiveTargetableTypes,
  setActivityTypeTargets,
} from "@/lib/services/workspace/activity-type-target-config";

const ROUTE = "@/app/api/settings/activity-type-targets/route";

function req(method: string, body?: unknown, query = "") {
  return new NextRequest(`http://test/api/settings/activity-type-targets${query}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  setSession(null);
  vi.mocked(listActiveTargetableTypes).mockClear();
  vi.mocked(setActivityTypeTargets).mockClear();
  vi.mocked(db.crmActivityTypeTarget.findMany).mockReset().mockResolvedValue([] as never);
});

describe("GET /api/settings/activity-type-targets", () => {
  it("401 when unauthenticated", async () => {
    const { GET } = await import(ROUTE);
    expect((await GET(req("GET"))).status).toBe(401);
  });

  it("403 for a non-admin (SalesUser), and reads nothing", async () => {
    setSession({ userId: "u2", orgId: "t1", role: "SalesUser" });
    const { GET } = await import(ROUTE);
    expect((await GET(req("GET"))).status).toBe(403);
    expect(listActiveTargetableTypes).not.toHaveBeenCalled();
  });

  it("403 for a Sales Manager (must be admin)", async () => {
    setSession({ userId: "u3", orgId: "t1", role: "SalesManager" });
    const { GET } = await import(ROUTE);
    expect((await GET(req("GET"))).status).toBe(403);
  });

  it("returns ACTIVE types for an Administrator, scoped to their orgId", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
    const { GET } = await import(ROUTE);
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(listActiveTargetableTypes).toHaveBeenCalledWith("t1");
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.types.map((t: { code: string }) => t.code)).toEqual(["call", "meeting"]);
  });

  it("exposes each type's configured count sources (defaulting to activity)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
    const { GET } = await import(ROUTE);
    const body = await (await GET(req("GET"))).json();
    expect(body.data.types[0].countsSources).toEqual(["activity", "call"]);
    expect(body.data.types[1].countsSources).toEqual(["activity"]);
  });

  it("scopes the org-wide target read to the session orgId", async () => {
    setSession({ userId: "u1", orgId: "t9", role: "Administrator" });
    const { GET } = await import(ROUTE);
    await GET(req("GET"));
    const where = vi.mocked(db.crmActivityTypeTarget.findMany).mock.calls[0]?.[0] as {
      where: { orgId: string };
    };
    expect(where.where.orgId).toBe("t9");
  });

  it("omits targets whose activity type is no longer active", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
    vi.mocked(db.crmActivityTypeTarget.findMany).mockResolvedValue([
      { userId: "u5", activityTypeId: "at1", dailyTarget: 20 },
      { userId: "u5", activityTypeId: "deactivated", dailyTarget: 7 },
    ] as never);
    const { GET } = await import(ROUTE);
    const body = await (await GET(req("GET"))).json();
    expect(body.data.targets.u5).toEqual({ at1: 20 });
  });
});

describe("PATCH /api/settings/activity-type-targets", () => {
  const validBody = {
    targets: [{ userId: "u5", activityTypeId: "at1", dailyTarget: 20 }],
  };

  it("401 when unauthenticated", async () => {
    const { PATCH } = await import(ROUTE);
    expect((await PATCH(req("PATCH", validBody))).status).toBe(401);
  });

  it("403 for a non-admin (does not write)", async () => {
    setSession({ userId: "u2", orgId: "t1", role: "SalesUser" });
    const { PATCH } = await import(ROUTE);
    expect((await PATCH(req("PATCH", validBody))).status).toBe(403);
    expect(setActivityTypeTargets).not.toHaveBeenCalled();
  });

  it("400 on a negative target", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(
      req("PATCH", { targets: [{ userId: "u5", activityTypeId: "at1", dailyTarget: -1 }] }),
    );
    expect(res.status).toBe(400);
    expect(setActivityTypeTargets).not.toHaveBeenCalled();
  });

  it("400 on a non-integer target", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(
      req("PATCH", { targets: [{ userId: "u5", activityTypeId: "at1", dailyTarget: 2.5 }] }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts 0 as a real assignment", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(
      req("PATCH", { targets: [{ userId: "u5", activityTypeId: "at1", dailyTarget: 0 }] }),
    );
    expect(res.status).toBe(200);
    expect(setActivityTypeTargets).toHaveBeenCalledWith("t1", [
      { userId: "u5", activityTypeId: "at1", dailyTarget: 0 },
    ]);
  });

  it("writes with the SESSION orgId, never a client-supplied one", async () => {
    setSession({ userId: "u1", orgId: "t7", role: "Administrator" });
    const { PATCH } = await import(ROUTE);
    // A forged orgId in the payload must be ignored — the schema drops it and
    // the service is called with the session's org.
    const res = await PATCH(
      req("PATCH", {
        orgId: "other-org",
        targets: [{ userId: "u5", activityTypeId: "at1", dailyTarget: 12 }],
      }),
    );
    expect(res.status).toBe(200);
    expect(setActivityTypeTargets).toHaveBeenCalledWith("t7", [
      { userId: "u5", activityTypeId: "at1", dailyTarget: 12 },
    ]);
  });
});
