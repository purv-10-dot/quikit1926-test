import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { GET } from "@/app/api/assets/route";
import { GET as GET_MINE } from "@/app/api/assets/mine/route";

/** Grant every (resource, action) — simulates an admin/manager. */
function grantAll() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockResolvedValue({ id: "perm" } as never);
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}

/** Grant Asset:view but NOT Asset:viewAll — simulates a plain Member. */
function grantMemberOnly() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockImplementation((args) => {
    const action = (args as { where?: { action?: string } })?.where?.action;
    return Promise.resolve(action === "view" ? { id: "perm" } : null) as never;
  });
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}

describe("GET /api/assets — role-aware scoping", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET(makeReq("/api/assets"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns the FULL register for a viewAll holder (no id filter)", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    mockDb.astAsset.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }] as never);

    const res = await GET(makeReq("/api/assets"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    const call = mockDb.astAsset.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; id?: unknown };
    };
    expect(call.where.orgId).toBe("org1");
    expect(call.where.id).toBeUndefined(); // full register, unscoped
  });

  it("scopes a Member to only their assigned assets (email-match)", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantMemberOnly();
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
    mockDb.astAssignment.findMany.mockResolvedValue([
      { assetId: "a1" },
      { assetId: "a2" },
    ] as never);
    mockDb.astAsset.findMany.mockResolvedValue([{ id: "a1" }] as never);

    const res = await GET(makeReq("/api/assets"), { params: {} });
    expect(res.status).toBe(200);

    const call = mockDb.astAsset.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; id?: { in: string[] } };
    };
    expect(call.where.id?.in).toEqual(["a1", "a2"]);
  });

  it("returns [] for a Member with no matching employee (no register leak)", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "ghost@x.com" });
    grantMemberOnly();
    mockDb.astEmployee.findFirst.mockResolvedValue(null as never);

    const res = await GET(makeReq("/api/assets"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(mockDb.astAsset.findMany).not.toHaveBeenCalled();
  });

  it("scopes the assignment lookup to the caller's org", async () => {
    setSession({ id: "u1", orgId: "org-A", role: "member", email: "u1@x.com" });
    grantMemberOnly();
    mockDb.astEmployee.findFirst.mockResolvedValue(null as never);

    await GET(makeReq("/api/assets"), { params: {} });

    const call = mockDb.astEmployee.findFirst.mock.calls[0]?.[0] as {
      where: { orgId: string };
    };
    expect(call.where.orgId).toBe("org-A");
  });
});

describe("GET /api/assets/mine", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET_MINE(makeReq("/api/assets/mine"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns the caller's assigned assets with assignment metadata", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantMemberOnly();
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
    mockDb.astAssignment.findMany.mockResolvedValue([
      {
        id: "as1",
        assignedAt: new Date("2026-01-01T00:00:00Z"),
        condition: "Good",
        expectedReturn: null,
        asset: { id: "a1", itemName: "Laptop", itemCode: "LP1", baseCategory: null, category: null },
      },
    ] as never);

    const res = await GET_MINE(makeReq("/api/assets/mine"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe("a1");
    expect(json.data[0].itemName).toBe("Laptop");
    expect(json.data[0].assignment.condition).toBe("Good");
  });

  it("returns [] when the caller maps to no employee", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "ghost@x.com" });
    grantMemberOnly();
    mockDb.astEmployee.findFirst.mockResolvedValue(null as never);

    const res = await GET_MINE(makeReq("/api/assets/mine"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(mockDb.astAssignment.findMany).not.toHaveBeenCalled();
  });
});
