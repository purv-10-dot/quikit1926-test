import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { GET, POST } from "@/app/api/assets/route";
import { GET as GET_MINE } from "@/app/api/assets/mine/route";
import { PUT, DELETE } from "@/app/api/assets/[id]/route";
import { POST as BULK_DELETE } from "@/app/api/assets/bulk-delete/route";

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

/**
 * Grant view/create/update/delete but NOT viewAll — a custom "asset editor"
 * role (broader than Member, narrower than admin). Row scope must still apply.
 */
function grantEditorNoViewAll() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockImplementation((args) => {
    const action = (args as { where?: { action?: string } })?.where?.action;
    return Promise.resolve(action === "viewAll" ? null : { id: "perm" }) as never;
  });
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}

/** The caller maps to employee `emp1`, actively assigned the given asset ids. */
function assignedTo(...assetIds: string[]) {
  mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
  mockDb.astAssignment.findMany.mockResolvedValue(assetIds.map((assetId) => ({ assetId })) as never);
}

describe("POST /api/assets — price is required (#2)", () => {
  beforeEach(() => resetMockDb());

  const base = {
    assetType: "Fixed", baseCategoryId: "b1", categoryId: "c1", itemName: "Laptop",
    itemCode: "LAP-9", serialNumber: "SN-9", invoiceNumber: "INV-9",
    purchaseDate: "2026-01-01", location: "HQ", condition: "Good", description: "x",
  };

  it("400s when price is missing", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    const res = await POST(makeReq("/api/assets", { method: "POST", body: base }), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astAsset.create).not.toHaveBeenCalled();
  });

  it("400s when price is negative", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    const res = await POST(makeReq("/api/assets", { method: "POST", body: { ...base, price: -5 } }), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astAsset.create).not.toHaveBeenCalled();
  });

  it("201s and persists a valid price", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    mockDb.astAsset.create.mockResolvedValue({ id: "a9", itemName: "Laptop", itemCode: "LAP-9" } as never);
    const res = await POST(makeReq("/api/assets", { method: "POST", body: { ...base, price: 1200 } }), { params: {} });
    expect(res.status).toBe(201);
    const call = mockDb.astAsset.create.mock.calls[0]?.[0] as { data: { price: number } };
    expect(call.data.price).toBe(1200);
  });

  it("defaults assetType to 'Fixed' when the form omits it (#2 Asset Type merge)", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    mockDb.astAsset.create.mockResolvedValue({ id: "a9", itemName: "Laptop", itemCode: "LAP-9" } as never);
    const { assetType: _omit, ...noType } = { ...base, price: 500 };
    const res = await POST(makeReq("/api/assets", { method: "POST", body: noType }), { params: {} });
    expect(res.status).toBe(201);
    const call = mockDb.astAsset.create.mock.calls[0]?.[0] as { data: { assetType: string } };
    expect(call.data.assetType).toBe("Fixed");
  });
});

describe("Item Code & Serial Number are required at the API", () => {
  beforeEach(() => resetMockDb());

  const base = {
    assetType: "Fixed", baseCategoryId: "b1", categoryId: "c1", itemName: "Laptop",
    itemCode: "LAP-9", serialNumber: "SN-9", invoiceNumber: "INV-9", price: 100,
    purchaseDate: "2026-01-01", location: "HQ", condition: "Good", description: "x",
  };

  it("POST 400s a blank Item Code (single create)", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    const res = await POST(makeReq("/api/assets", { method: "POST", body: { ...base, itemCode: "" } }), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astAsset.create).not.toHaveBeenCalled();
  });

  it("POST 400s a whitespace-only Serial Number (single create)", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    const res = await POST(makeReq("/api/assets", { method: "POST", body: { ...base, serialNumber: "   " } }), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astAsset.create).not.toHaveBeenCalled();
  });

  it("PUT 400s an attempt to clear the Item Code on edit", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    const res = await PUT(makeReq("/api/assets/a1", { method: "PUT", body: { itemCode: "" } }), { params: { id: "a1" } });
    expect(res.status).toBe(400);
    expect(mockDb.astAsset.update).not.toHaveBeenCalled();
  });
});

describe("Actor attribution (Added by)", () => {
  beforeEach(() => resetMockDb());

  const base = {
    assetType: "Fixed", baseCategoryId: "b1", categoryId: "c1", itemName: "Laptop",
    itemCode: "LAP-9", serialNumber: "SN-9", invoiceNumber: "INV-9", price: 100,
    purchaseDate: "2026-01-01", location: "HQ", condition: "Good", description: "x",
  };

  it("POST stamps createdByUserId with the session user", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    mockDb.astAsset.create.mockResolvedValue({ id: "a9", itemName: "Laptop", itemCode: "LAP-9" } as never);
    const res = await POST(makeReq("/api/assets", { method: "POST", body: base }), { params: {} });
    expect(res.status).toBe(201);
    const call = mockDb.astAsset.create.mock.calls[0]?.[0] as { data: { createdByUserId: string } };
    expect(call.data.createdByUserId).toBe("admin");
  });

  it("GET resolves addedByName from the User table (batched)", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    mockDb.astAsset.findMany.mockResolvedValue([{ id: "a1", createdByUserId: "admin" }] as never);
    mockDb.user.findMany.mockResolvedValue([{ id: "admin", firstName: "Ada", lastName: "Admin", email: "ada@x.com" }] as never);

    const res = await GET(makeReq("/api/assets"), { params: {} });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data[0].addedByName).toBe("Ada Admin");
    const call = mockDb.user.findMany.mock.calls[0]?.[0] as { where: { id: { in: string[] } } };
    expect(call.where.id.in).toEqual(["admin"]);
  });

  it("GET returns addedByName null for a legacy asset with no actor (no User lookup)", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    mockDb.astAsset.findMany.mockResolvedValue([{ id: "a1", createdByUserId: null }] as never);

    const res = await GET(makeReq("/api/assets"), { params: {} });
    const json = await res.json();
    expect(json.data[0].addedByName).toBeNull();
    expect(mockDb.user.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/assets — role-aware scoping", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET(makeReq("/api/assets"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("403s a soft-removed user (access denied at the auth layer)", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantMemberOnly();
    mockDb.astUserRemoval.findUnique.mockResolvedValue({ id: "rm1" } as never); // removed

    const res = await GET(makeReq("/api/assets"), { params: {} });
    expect(res.status).toBe(403);
    // Blocked before any asset query.
    expect(mockDb.astAsset.findMany).not.toHaveBeenCalled();
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

describe("PUT /api/assets/[id] — write scope", () => {
  beforeEach(() => resetMockDb());

  it("404s + does not update when a non-viewAll role targets an unassigned asset", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantEditorNoViewAll();
    assignedTo("asset-assigned"); // caller is NOT assigned "asset-other"

    const res = await PUT(
      makeReq("/api/assets/asset-other", { method: "PUT", body: { itemName: "Hacked" } }),
      { params: { id: "asset-other" } },
    );

    expect(res.status).toBe(404);
    expect(mockDb.astAsset.update).not.toHaveBeenCalled();
    expect(mockDb.astAsset.findFirst).not.toHaveBeenCalled(); // short-circuits before the row fetch
  });

  it("updates an asset the non-viewAll role IS assigned", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantEditorNoViewAll();
    assignedTo("asset-1");
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "asset-1" } as never);
    mockDb.astAsset.update.mockResolvedValue({
      id: "asset-1",
      itemName: "Renamed",
      itemCode: "C1",
      baseCategory: null,
      category: null,
    } as never);

    const res = await PUT(
      makeReq("/api/assets/asset-1", { method: "PUT", body: { itemName: "Renamed" } }),
      { params: { id: "asset-1" } },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.id).toBe("asset-1");
    expect(mockDb.astAsset.update).toHaveBeenCalledOnce();
  });

  it("lets a viewAll holder update any asset (no regression)", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "any-asset" } as never);
    mockDb.astAsset.update.mockResolvedValue({
      id: "any-asset",
      itemName: "X",
      itemCode: "C",
      baseCategory: null,
      category: null,
    } as never);

    const res = await PUT(
      makeReq("/api/assets/any-asset", { method: "PUT", body: { itemName: "X" } }),
      { params: { id: "any-asset" } },
    );

    expect(res.status).toBe(200);
    // viewAll → no assignment lookup needed
    expect(mockDb.astAssignment.findMany).not.toHaveBeenCalled();
    expect(mockDb.astAsset.update).toHaveBeenCalledOnce();
  });
});

describe("DELETE /api/assets/[id] — write scope", () => {
  beforeEach(() => resetMockDb());

  it("404s + does not delete when a non-viewAll role targets an unassigned asset", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantEditorNoViewAll();
    assignedTo("asset-assigned");

    const res = await DELETE(
      makeReq("/api/assets/asset-other", { method: "DELETE" }),
      { params: { id: "asset-other" } },
    );

    expect(res.status).toBe(404);
    expect(mockDb.astAsset.delete).not.toHaveBeenCalled();
  });

  it("deletes an asset the non-viewAll role IS assigned", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantEditorNoViewAll();
    assignedTo("asset-1");
    mockDb.astAsset.findFirst.mockResolvedValue({
      id: "asset-1",
      itemName: "Laptop",
      itemCode: "LP1",
    } as never);
    mockDb.astAsset.delete.mockResolvedValue({} as never);

    const res = await DELETE(
      makeReq("/api/assets/asset-1", { method: "DELETE" }),
      { params: { id: "asset-1" } },
    );

    expect(res.status).toBe(200);
    expect(mockDb.astAsset.delete).toHaveBeenCalledOnce();
  });
});

describe("POST /api/assets/bulk-delete — write scope", () => {
  beforeEach(() => resetMockDb());

  it("deletes only the assigned subset for a non-viewAll role", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantEditorNoViewAll();
    assignedTo("a1", "a3"); // caller is not assigned "a2"
    mockDb.astAsset.deleteMany.mockResolvedValue({ count: 2 } as never);

    const res = await BULK_DELETE(
      makeReq("/api/assets/bulk-delete", { method: "POST", body: { ids: ["a1", "a2", "a3"] } }),
      { params: {} },
    );

    expect(res.status).toBe(200);
    const call = mockDb.astAsset.deleteMany.mock.calls[0]?.[0] as {
      where: { orgId: string; id: { in: string[] } };
    };
    expect(call.where.orgId).toBe("org1");
    expect(call.where.id.in).toEqual(["a1", "a3"]); // "a2" (unassigned) dropped
  });

  it("deletes all requested ids for a viewAll holder (no regression)", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    mockDb.astAsset.deleteMany.mockResolvedValue({ count: 3 } as never);

    const res = await BULK_DELETE(
      makeReq("/api/assets/bulk-delete", { method: "POST", body: { ids: ["a1", "a2", "a3"] } }),
      { params: {} },
    );

    expect(res.status).toBe(200);
    expect(mockDb.astAssignment.findMany).not.toHaveBeenCalled();
    const call = mockDb.astAsset.deleteMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] } };
    };
    expect(call.where.id.in).toEqual(["a1", "a2", "a3"]);
  });
});
