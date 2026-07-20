import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { GET } from "@/app/api/employee-requests/route";

/** RBAC gate keyed on BOTH resource + action (userCan filters findFirst by both). */
function grant(allow: (resource: string, action: string) => boolean) {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockImplementation((args) => {
    const w = (args as { where?: { resource?: string; action?: string } })?.where;
    return Promise.resolve(w?.resource && w?.action && allow(w.resource, w.action) ? { id: "perm" } : null) as never;
  });
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}
const grantNone = () => grant(() => false);
const grantAssetViewAll = () => grant((r, a) => r === "AssetRequest" && a === "viewAll");
const grantRepairViewAll = () => grant((r, a) => r === "RepairRequest" && a === "viewAll");
const grantBothViewAll = () => grant((r, a) => a === "viewAll" && (r === "AssetRequest" || r === "RepairRequest"));

const ADMIN = { id: "admin", orgId: "org1", role: "admin" as const };
const MEMBER = { id: "u1", orgId: "org1", role: "member" as const, email: "u1@x.com" };

/** Stub the joins both list branches perform, so a branch can run without extra setup. */
function stubJoins() {
  mockDb.astEmployee.findMany.mockResolvedValue([] as never);
  mockDb.astBaseCategory.findMany.mockResolvedValue([] as never);
}

describe("GET /api/employee-requests — unified queue", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET(makeReq("/api/employee-requests"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("403s a caller holding neither viewAll capability", async () => {
    setSession(MEMBER);
    grantNone();
    const res = await GET(makeReq("/api/employee-requests"), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.astAssetRequest.findMany).not.toHaveBeenCalled();
    expect(mockDb.astRepairRequest.findMany).not.toHaveBeenCalled();
  });

  it("asset-only viewAll → returns asset requests, skips the repair query entirely", async () => {
    setSession(MEMBER);
    grantAssetViewAll();
    stubJoins();
    mockDb.astAssetRequest.findMany.mockResolvedValue([{ id: "a1", requesterUserId: "u1", baseCategoryId: null }] as never);

    const res = await GET(makeReq("/api/employee-requests"), { params: {} });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.assetRequests).toHaveLength(1);
    expect(json.data.repairRequests).toEqual([]);
    expect(mockDb.astRepairRequest.findMany).not.toHaveBeenCalled();
  });

  it("repair-only viewAll → returns repair requests, skips the asset query entirely", async () => {
    setSession(MEMBER);
    grantRepairViewAll();
    stubJoins();
    mockDb.astRepairRequest.findMany.mockResolvedValue([
      { id: "r1", requesterUserId: "u1", asset: { itemName: "MacBook", itemCode: "AST-1", category: { name: "Laptop" } } },
    ] as never);

    const res = await GET(makeReq("/api/employee-requests"), { params: {} });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.repairRequests).toHaveLength(1);
    expect(json.data.repairRequests[0].assetName).toBe("MacBook");
    expect(json.data.assetRequests).toEqual([]);
    expect(mockDb.astAssetRequest.findMany).not.toHaveBeenCalled();
  });

  it("both viewAll → returns both arrays, each scoped to the caller's org", async () => {
    setSession(ADMIN);
    grantBothViewAll();
    stubJoins();
    mockDb.astAssetRequest.findMany.mockResolvedValue([{ id: "a1", requesterUserId: "u1", baseCategoryId: null }] as never);
    mockDb.astRepairRequest.findMany.mockResolvedValue([{ id: "r1", requesterUserId: "u2", asset: null }] as never);

    const res = await GET(makeReq("/api/employee-requests"), { params: {} });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.assetRequests).toHaveLength(1);
    expect(json.data.repairRequests).toHaveLength(1);

    const assetWhere = (mockDb.astAssetRequest.findMany.mock.calls[0]?.[0] as { where: { orgId: string } }).where;
    const repairWhere = (mockDb.astRepairRequest.findMany.mock.calls[0]?.[0] as { where: { orgId: string } }).where;
    expect(assetWhere.orgId).toBe("org1");
    expect(repairWhere.orgId).toBe("org1");
  });
});
