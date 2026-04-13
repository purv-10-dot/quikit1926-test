import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

import { GET } from "@/app/api/dashboard/stats/route";

const USER = "user-admin-001";
const TENANT = "tenant-admin-001";

function asAdmin() {
  setSession({ id: USER, tenantId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1", userId: USER, tenantId: TENANT, role: "admin", status: "active",
  } as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/dashboard/stats — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("GET /api/dashboard/stats — happy path", () => {
  beforeEach(asAdmin);

  it("returns all four counts", async () => {
    mockDb.membership.count
      .mockResolvedValueOnce(42)   // active members
      .mockResolvedValueOnce(5);   // pending invites
    mockDb.team.count.mockResolvedValue(8);
    mockDb.app.count.mockResolvedValue(3);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      memberCount: 42,
      teamCount: 8,
      pendingInvites: 5,
      appCount: 3,
    });
  });

  it("returns zeros when org is empty", async () => {
    mockDb.membership.count.mockResolvedValue(0);
    mockDb.team.count.mockResolvedValue(0);
    mockDb.app.count.mockResolvedValue(0);

    const res = await GET();
    const body = await res.json();
    expect(body.data.memberCount).toBe(0);
    expect(body.data.teamCount).toBe(0);
  });
});
