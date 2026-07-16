import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { GET, POST as CREATE } from "@/app/api/asset-requests/route";
import { GET as CATEGORIES } from "@/app/api/asset-requests/categories/route";
import { POST as DECIDE } from "@/app/api/asset-requests/[id]/decision/route";
import { POST as FULFIL } from "@/app/api/asset-requests/[id]/fulfil/route";

/** Configure the RBAC gate to allow only the actions for which `allow` is true. */
function grant(allow: (action: string) => boolean) {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockImplementation((args) => {
    const action = (args as { where?: { action?: string } })?.where?.action;
    return Promise.resolve(action && allow(action) ? { id: "perm" } : null) as never;
  });
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}
const grantAll = () => grant(() => true); // admin
const grantApprover = () => grant((a) => ["view", "viewAll", "approve"].includes(a));
const grantRequester = () => grant((a) => a === "view" || a === "create"); // no viewAll/approve
const grantNone = () => grant(() => false);

/** Run the transaction callback against the mock db (no real tx). */
function runTxInline() {
  mockDb.$transaction.mockImplementation((async (fn: unknown) =>
    (fn as (tx: typeof mockDb) => unknown)(mockDb)) as never);
}

const ADMIN = { id: "admin", orgId: "org1", role: "admin" as const };
const MEMBER = { id: "u1", orgId: "org1", role: "member" as const, email: "u1@x.com" };

describe("GET /api/asset-requests — queue scoping", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET(makeReq("/api/asset-requests"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("403s a caller without AssetRequest:view", async () => {
    setSession(MEMBER);
    grantNone();
    const res = await GET(makeReq("/api/asset-requests"), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.astAssetRequest.findMany).not.toHaveBeenCalled();
  });

  it("returns the FULL queue for a viewAll holder (no requester filter)", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAssetRequest.findMany.mockResolvedValue([
      { id: "r1", requesterUserId: "u1" },
      { id: "r2", requesterUserId: "u2" },
    ] as never);
    mockDb.astEmployee.findMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("/api/asset-requests"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    const call = mockDb.astAssetRequest.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; requesterUserId?: string };
    };
    expect(call.where.orgId).toBe("org1");
    expect(call.where.requesterUserId).toBeUndefined(); // unscoped
  });

  it("scopes a non-viewAll caller to their own requests", async () => {
    setSession(MEMBER);
    grantRequester();
    mockDb.astAssetRequest.findMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("/api/asset-requests"), { params: {} });
    expect(res.status).toBe(200);
    const call = mockDb.astAssetRequest.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; requesterUserId?: string };
    };
    expect(call.where.requesterUserId).toBe("u1");
  });

  it("?mine=1 force-scopes even a viewAll holder to their own requests", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAssetRequest.findMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("/api/asset-requests?mine=1"), { params: {} });
    expect(res.status).toBe(200);
    const call = mockDb.astAssetRequest.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; requesterUserId?: string };
    };
    expect(call.where.requesterUserId).toBe("admin"); // scoped despite viewAll
  });

  it("resolves requester name + employee id via the identity bridge", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAssetRequest.findMany.mockResolvedValue([{ id: "r1", requesterUserId: "u9" }] as never);
    mockDb.astEmployee.findMany.mockResolvedValue([
      { userId: "u9", name: "Nadia", employeeId: "EMP-0009" },
    ] as never);

    const res = await GET(makeReq("/api/asset-requests"), { params: {} });
    const json = await res.json();
    expect(json.data[0].requesterName).toBe("Nadia");
    expect(json.data[0].requesterEmployeeId).toBe("EMP-0009");
  });

  it("400s on an invalid status filter", async () => {
    setSession(ADMIN);
    grantAll();
    const res = await GET(makeReq("/api/asset-requests?status=Bogus"), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astAssetRequest.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/asset-requests — raise a request", () => {
  beforeEach(() => resetMockDb());

  const validBody = {
    categoryId: "c1",
    itemKind: "Physical",
    requestType: "New",
    quantity: 2,
    justification: "Two new hires need laptops.",
    priority: "High",
    requiredBy: "2026-08-01",
  };

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await CREATE(makeReq("/api/asset-requests", { method: "POST", body: validBody }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("403s a caller without AssetRequest:create", async () => {
    setSession(MEMBER);
    grant((a) => a === "view"); // view but not create
    const res = await CREATE(makeReq("/api/asset-requests", { method: "POST", body: validBody }), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.astAssetRequest.create).not.toHaveBeenCalled();
  });

  it("creates a Submitted request owned by the caller, resolving the category name", async () => {
    setSession(MEMBER);
    grantRequester();
    mockDb.astCategory.findFirst.mockResolvedValue({ name: "Laptop", baseCategoryId: "b1" } as never);
    mockDb.astAssetRequest.create.mockResolvedValue({ id: "r1", itemType: "Laptop", status: "Submitted" } as never);

    const res = await CREATE(makeReq("/api/asset-requests", { method: "POST", body: validBody }), { params: {} });
    expect(res.status).toBe(201);
    const call = mockDb.astAssetRequest.create.mock.calls[0]?.[0] as {
      data: {
        orgId: string; requesterUserId: string; status: string; itemType: string;
        baseCategoryId: string; categoryId: string; quantity: number; requiredBy: string | null;
      };
    };
    expect(call.data).toMatchObject({
      orgId: "org1",
      requesterUserId: "u1",
      status: "Submitted",
      itemType: "Laptop",
      baseCategoryId: "b1",
      categoryId: "c1",
      quantity: 2,
      requiredBy: "2026-08-01",
    });
  });

  it("400s an invalid body (quantity < 1) without touching the db", async () => {
    setSession(MEMBER);
    grantRequester();
    const res = await CREATE(
      makeReq("/api/asset-requests", { method: "POST", body: { ...validBody, quantity: 0 } }),
      { params: {} },
    );
    expect(res.status).toBe(400);
    expect(mockDb.astCategory.findFirst).not.toHaveBeenCalled();
    expect(mockDb.astAssetRequest.create).not.toHaveBeenCalled();
  });

  it("404s + scopes the category lookup to the caller's org (tenant isolation)", async () => {
    setSession(MEMBER);
    grantRequester();
    mockDb.astCategory.findFirst.mockResolvedValue(null as never); // category not in this org

    const res = await CREATE(makeReq("/api/asset-requests", { method: "POST", body: validBody }), { params: {} });
    expect(res.status).toBe(404);
    expect(mockDb.astAssetRequest.create).not.toHaveBeenCalled();
    const call = mockDb.astCategory.findFirst.mock.calls[0]?.[0] as { where: { id: string; orgId: string } };
    expect(call.where).toMatchObject({ id: "c1", orgId: "org1" });
  });
});

describe("GET /api/asset-requests/categories — request-form category list", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await CATEGORIES(makeReq("/api/asset-requests/categories"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("403s a caller without AssetRequest:create", async () => {
    setSession(MEMBER);
    grant((a) => a === "view"); // view but not create
    const res = await CATEGORIES(makeReq("/api/asset-requests/categories"), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.astCategory.findMany).not.toHaveBeenCalled();
  });

  it("returns the org's categories for an AssetRequest:create holder, scoped to org", async () => {
    setSession(MEMBER);
    grantRequester();
    mockDb.astCategory.findMany.mockResolvedValue([
      { id: "c1", name: "Laptop", baseCategory: { name: "Electronics" } },
    ] as never);

    const res = await CATEGORIES(makeReq("/api/asset-requests/categories"), { params: {} });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    const call = mockDb.astCategory.findMany.mock.calls[0]?.[0] as { where: { orgId: string } };
    expect(call.where.orgId).toBe("org1");
  });
});

describe("POST /api/asset-requests/[id]/decision", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await DECIDE(makeReq("/api/asset-requests/r1/decision", { method: "POST", body: { action: "approve" } }), { params: { id: "r1" } });
    expect(res.status).toBe(401);
  });

  it("403s a caller without AssetRequest:approve", async () => {
    setSession(MEMBER);
    grantRequester();
    const res = await DECIDE(makeReq("/api/asset-requests/r1/decision", { method: "POST", body: { action: "approve" } }), { params: { id: "r1" } });
    expect(res.status).toBe(403);
    expect(mockDb.astAssetRequest.update).not.toHaveBeenCalled();
  });

  it("approves a PendingApproval request", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astAssetRequest.findFirst.mockResolvedValue({ id: "r1", status: "PendingApproval", itemType: "Laptop" } as never);
    mockDb.astAssetRequest.update.mockResolvedValue({ id: "r1", status: "Approved" } as never);

    const res = await DECIDE(makeReq("/api/asset-requests/r1/decision", { method: "POST", body: { action: "approve", note: "ok" } }), { params: { id: "r1" } });
    expect(res.status).toBe(200);
    const call = mockDb.astAssetRequest.update.mock.calls[0]?.[0] as { data: { status: string; reviewedByUserId: string } };
    expect(call.data.status).toBe("Approved");
    expect(call.data.reviewedByUserId).toBe("admin");
  });

  it("rejects with a reason", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astAssetRequest.findFirst.mockResolvedValue({ id: "r1", status: "Submitted", itemType: "Laptop" } as never);
    mockDb.astAssetRequest.update.mockResolvedValue({ id: "r1", status: "Rejected" } as never);

    const res = await DECIDE(makeReq("/api/asset-requests/r1/decision", { method: "POST", body: { action: "reject", note: "no budget" } }), { params: { id: "r1" } });
    expect(res.status).toBe(200);
    const call = mockDb.astAssetRequest.update.mock.calls[0]?.[0] as { data: { status: string; decisionNote: string } };
    expect(call.data.status).toBe("Rejected");
    expect(call.data.decisionNote).toBe("no budget");
  });

  it("400s rejecting without a reason", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astAssetRequest.findFirst.mockResolvedValue({ id: "r1", status: "PendingApproval", itemType: "Laptop" } as never);
    const res = await DECIDE(makeReq("/api/asset-requests/r1/decision", { method: "POST", body: { action: "reject" } }), { params: { id: "r1" } });
    expect(res.status).toBe(400);
    expect(mockDb.astAssetRequest.update).not.toHaveBeenCalled();
  });

  it("409s deciding a request that is not actionable", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astAssetRequest.findFirst.mockResolvedValue({ id: "r1", status: "Approved", itemType: "Laptop" } as never);
    const res = await DECIDE(makeReq("/api/asset-requests/r1/decision", { method: "POST", body: { action: "approve" } }), { params: { id: "r1" } });
    expect(res.status).toBe(409);
  });

  it("404s + scopes the lookup to the caller's org (tenant isolation)", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astAssetRequest.findFirst.mockResolvedValue(null as never); // not in this org
    const res = await DECIDE(makeReq("/api/asset-requests/r1/decision", { method: "POST", body: { action: "approve" } }), { params: { id: "r1" } });
    expect(res.status).toBe(404);
    const call = mockDb.astAssetRequest.findFirst.mock.calls[0]?.[0] as { where: { id: string; orgId: string } };
    expect(call.where.orgId).toBe("org1");
  });
});

describe("POST /api/asset-requests/[id]/fulfil", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await FULFIL(makeReq("/api/asset-requests/r1/fulfil", { method: "POST", body: {} }), { params: { id: "r1" } });
    expect(res.status).toBe(401);
  });

  it("403s a caller without AssetRequest:approve", async () => {
    setSession(MEMBER);
    grantRequester();
    const res = await FULFIL(makeReq("/api/asset-requests/r1/fulfil", { method: "POST", body: {} }), { params: { id: "r1" } });
    expect(res.status).toBe(403);
  });

  it("409s fulfilling a request that isn't approved", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astAssetRequest.findFirst.mockResolvedValue({ id: "r1", status: "Submitted", itemKind: "Physical", quantity: 1, quantityFulfilled: 0 } as never);
    const res = await FULFIL(makeReq("/api/asset-requests/r1/fulfil", { method: "POST", body: { assetId: "a1" } }), { params: { id: "r1" } });
    expect(res.status).toBe(409);
  });

  it("subscription → status-only fulfilment, no assignment", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astAssetRequest.findFirst.mockResolvedValue({
      id: "r1", status: "Approved", itemKind: "Subscription", quantity: 1, quantityFulfilled: 0, itemType: "Claude seat", fulfilmentNote: null,
    } as never);
    mockDb.astAssetRequest.update.mockResolvedValue({ id: "r1", status: "Fulfilled" } as never);

    const res = await FULFIL(makeReq("/api/asset-requests/r1/fulfil", { method: "POST", body: { note: "seat provisioned" } }), { params: { id: "r1" } });
    expect(res.status).toBe(200);
    const call = mockDb.astAssetRequest.update.mock.calls[0]?.[0] as { data: { status: string; quantityFulfilled: number; fulfilmentNote: string } };
    expect(call.data.status).toBe("Fulfilled");
    expect(call.data.quantityFulfilled).toBe(1);
    expect(call.data.fulfilmentNote).toBe("seat provisioned");
    expect(mockDb.astAssignment.create).not.toHaveBeenCalled();
  });

  it("physical (qty 1) → creates assignment, marks asset Assigned, Fulfilled", async () => {
    setSession(ADMIN);
    grantApprover();
    runTxInline();
    mockDb.astAssetRequest.findFirst.mockResolvedValue({
      id: "r1", status: "Approved", itemKind: "Physical", quantity: 1, quantityFulfilled: 0, requesterUserId: "u1", itemType: "Laptop",
    } as never);
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Available", itemName: "MacBook" } as never);
    mockDb.astAssignment.create.mockResolvedValue({ id: "as1" } as never);
    mockDb.astAsset.update.mockResolvedValue({ id: "a1" } as never);
    mockDb.astAssetRequest.update.mockResolvedValue({ id: "r1", status: "Fulfilled", quantityFulfilled: 1 } as never);

    const res = await FULFIL(makeReq("/api/asset-requests/r1/fulfil", { method: "POST", body: { assetId: "a1" } }), { params: { id: "r1" } });
    expect(res.status).toBe(200);

    const asg = mockDb.astAssignment.create.mock.calls[0]?.[0] as { data: { assetId: string; userId: string; requestId: string; status: string } };
    expect(asg.data).toMatchObject({ assetId: "a1", userId: "emp1", requestId: "r1", status: "Active" });
    const assetUpd = mockDb.astAsset.update.mock.calls[0]?.[0] as { data: { assetStatus: string } };
    expect(assetUpd.data.assetStatus).toBe("Assigned");
    const reqUpd = mockDb.astAssetRequest.update.mock.calls[0]?.[0] as { data: { status: string; quantityFulfilled: number } };
    expect(reqUpd.data).toMatchObject({ status: "Fulfilled", quantityFulfilled: 1 });
  });

  it("physical (qty 2) → one unit yields PartiallyFulfilled", async () => {
    setSession(ADMIN);
    grantApprover();
    runTxInline();
    mockDb.astAssetRequest.findFirst.mockResolvedValue({
      id: "r1", status: "Approved", itemKind: "Physical", quantity: 2, quantityFulfilled: 0, requesterUserId: "u1", itemType: "Laptop",
    } as never);
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Available", itemName: "MacBook" } as never);
    mockDb.astAssignment.create.mockResolvedValue({ id: "as1" } as never);
    mockDb.astAsset.update.mockResolvedValue({ id: "a1" } as never);
    mockDb.astAssetRequest.update.mockResolvedValue({ id: "r1", status: "PartiallyFulfilled", quantityFulfilled: 1 } as never);

    const res = await FULFIL(makeReq("/api/asset-requests/r1/fulfil", { method: "POST", body: { assetId: "a1" } }), { params: { id: "r1" } });
    expect(res.status).toBe(200);
    const reqUpd = mockDb.astAssetRequest.update.mock.calls[0]?.[0] as { data: { status: string; quantityFulfilled: number } };
    expect(reqUpd.data).toMatchObject({ status: "PartiallyFulfilled", quantityFulfilled: 1 });
  });

  it("400s a physical fulfil with no assetId", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astAssetRequest.findFirst.mockResolvedValue({
      id: "r1", status: "Approved", itemKind: "Physical", quantity: 1, quantityFulfilled: 0, requesterUserId: "u1", itemType: "Laptop",
    } as never);
    const res = await FULFIL(makeReq("/api/asset-requests/r1/fulfil", { method: "POST", body: {} }), { params: { id: "r1" } });
    expect(res.status).toBe(400);
  });

  it("409s when the chosen asset is not Available (no not-in-stock handling)", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astAssetRequest.findFirst.mockResolvedValue({
      id: "r1", status: "Approved", itemKind: "Physical", quantity: 1, quantityFulfilled: 0, requesterUserId: "u1", itemType: "Laptop",
    } as never);
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Assigned", itemName: "MacBook" } as never);

    const res = await FULFIL(makeReq("/api/asset-requests/r1/fulfil", { method: "POST", body: { assetId: "a1" } }), { params: { id: "r1" } });
    expect(res.status).toBe(409);
    expect(mockDb.astAssignment.create).not.toHaveBeenCalled();
  });

  it("422s when the requester has no linked employee and none is supplied", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astAssetRequest.findFirst.mockResolvedValue({
      id: "r1", status: "Approved", itemKind: "Physical", quantity: 1, quantityFulfilled: 0, requesterUserId: "ghost", itemType: "Laptop",
    } as never);
    mockDb.astEmployee.findFirst.mockResolvedValue(null as never);

    const res = await FULFIL(makeReq("/api/asset-requests/r1/fulfil", { method: "POST", body: { assetId: "a1" } }), { params: { id: "r1" } });
    expect(res.status).toBe(422);
  });

  it("409s when the request is already fully fulfilled", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astAssetRequest.findFirst.mockResolvedValue({
      id: "r1", status: "PartiallyFulfilled", itemKind: "Physical", quantity: 2, quantityFulfilled: 2, requesterUserId: "u1", itemType: "Laptop",
    } as never);
    const res = await FULFIL(makeReq("/api/asset-requests/r1/fulfil", { method: "POST", body: { assetId: "a1" } }), { params: { id: "r1" } });
    expect(res.status).toBe(409);
  });
});
