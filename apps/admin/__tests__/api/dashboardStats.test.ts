import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/dashboard/stats/route";

function req() {
  return new NextRequest(new URL("/api/dashboard/stats", "http://localhost:3005"), {
    method: "GET",
  } as never);
}

const USER = "user-admin-001";
const TENANT = "tenant-001";

function asAuthedAdmin() {
  setSession({ id: USER, orgId: TENANT, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    orgId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/dashboard/stats", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when user is not admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "employee" });
    mockDb.orgMember.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      orgId: TENANT,
      role: "employee",
      status: "active",
    } as any);

    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("returns dashboard stats (happy path)", async () => {
    asAuthedAdmin();

    mockDb.orgMember.count
      .mockResolvedValueOnce(15) // memberCount (active)
      .mockResolvedValueOnce(3); // pendingInvites (invited)
    mockDb.team.count.mockResolvedValue(4);
    (mockDb.userAppAccess.groupBy as any).mockResolvedValue([
      { appId: "a1" },
      { appId: "a2" },
    ] as any);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.memberCount).toBe(15);
    expect(body.data.teamCount).toBe(4);
    expect(body.data.pendingInvites).toBe(3);
    expect(body.data.appCount).toBe(2);
  });

  it("filters counts by orgId (tenant isolation)", async () => {
    asAuthedAdmin();

    mockDb.orgMember.count.mockResolvedValue(0);
    mockDb.team.count.mockResolvedValue(0);
    (mockDb.userAppAccess.groupBy as any).mockResolvedValue([] as any);

    await GET(req());

    // Check membership.count calls include orgId
    for (const call of mockDb.orgMember.count.mock.calls) {
      expect((call[0] as any).where.orgId).toBe(TENANT);
    }

    // Check team.count call includes orgId
    const teamCountCall = mockDb.team.count.mock.calls[0]?.[0] as any;
    expect(teamCountCall.where.orgId).toBe(TENANT);

    // Check userAppAccess.groupBy call includes orgId
    const groupByCall = (mockDb.userAppAccess.groupBy as any).mock.calls[0]?.[0] as any;
    expect(groupByCall.where.orgId).toBe(TENANT);
  });
});
