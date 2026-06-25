/**
 * FR-4.4 — GET /api/dashboard/field-aggregates?activityTypeId=<id>
 *
 * Exposes getActivityFieldAggregates (FR-4.3). Two auth halves:
 *  - ACCESS: dashboard:view gate (401 unauth).
 *  - SCOPE:  the route MUST pass the REAL authenticated user through to the
 *    service, unmodified — the service's getScope/resolveManagerTeam scope on
 *    THAT user. FR-4.3 proved the service scopes given a user; this proves the
 *    ROUTE hands it the right (session) user, so the scope safety actually holds
 *    on this new invocation path. A route that gates dashboard:view but calls
 *    the service with the wrong/elevated user would pass auth and LEAK scope.
 *
 * Service is mocked here (its SQL/scope correctness is real-DB-verified at the
 * FR-4.3 gate); this test covers the route's gate + param + shape + user-passthrough.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

mockDb();

vi.mock("@/lib/services/dashboard/activity-field-aggregates", () => ({
  getActivityFieldAggregates: vi.fn(async () => []),
}));
import { getActivityFieldAggregates } from "@/lib/services/dashboard/activity-field-aggregates";

const ROUTE = "@/app/api/dashboard/field-aggregates/route";

function req(qs: string) {
  return new Request(`http://test/api/dashboard/field-aggregates${qs}`) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  setSession(null);
  vi.mocked(assertModule).mockReset();
  vi.mocked(assertModule).mockResolvedValue(undefined);
  vi.mocked(getActivityFieldAggregates).mockReset();
  vi.mocked(getActivityFieldAggregates).mockResolvedValue([] as never);
});

describe("GET /api/dashboard/field-aggregates", () => {
  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import(ROUTE);
    const res = await GET(req("?activityTypeId=at1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when activityTypeId is missing", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesManager", email: "m@x.co", name: "M" });
    const { GET } = await import(ROUTE);
    const res = await GET(req("")); // no activityTypeId
    expect(res.status).toBe(400);
    expect(getActivityFieldAggregates).not.toHaveBeenCalled();
  });

  it("gates on dashboard:view (assertModule called with dashboard/view)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesManager", email: "m@x.co", name: "M" });
    const { GET } = await import(ROUTE);
    await GET(req("?activityTypeId=at1"));
    expect(vi.mocked(assertModule)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", orgId: "t1" }),
      "dashboard",
      "view",
    );
  });

  it("SCOPE: passes the REAL authenticated session user (unmodified) to the service", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesManager", email: "m@x.co", name: "M" });
    const { GET } = await import(ROUTE);
    const res = await GET(req("?activityTypeId=at1"));

    expect(res.status).toBe(200);
    // the service must be called with ({ activityTypeId }, <the authenticated user>)
    // — the exact requireApiUser result, NOT an org-only/elevated/stubbed user.
    expect(getActivityFieldAggregates).toHaveBeenCalledWith(
      { userId: "u1", orgId: "t1", role: "SalesManager", email: "m@x.co", name: "M" },
      { activityTypeId: "at1" },
    );
  });

  it("returns { success: true, data } with the service's aggregates", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator", email: "a@x.co", name: "A" });
    vi.mocked(getActivityFieldAggregates).mockResolvedValue([
      { fieldKey: "bid", fieldLabel: "Bid", fieldType: "Number", perRep: [{ ownerId: "u1", ownerName: "A", numberSum: 250 }], teamTotal: { numberSum: 250 } },
    ] as never);
    const { GET } = await import(ROUTE);
    const res = await GET(req("?activityTypeId=at1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data[0]?.fieldKey).toBe("bid");
  });
});
