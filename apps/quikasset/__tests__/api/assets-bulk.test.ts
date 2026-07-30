import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { POST } from "@/app/api/assets/bulk/route";

function grantAll() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockResolvedValue({ id: "perm" } as never);
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}
function grantNoCreate() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockImplementation((args) => {
    const action = (args as { where?: { action?: string } })?.where?.action;
    return Promise.resolve(action === "view" ? { id: "perm" } : null) as never;
  });
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}
/** Run the array-form $transaction against the mock (resolves the create promises). */
function runTxInline() {
  mockDb.$transaction.mockImplementation(((ops: unknown) => Promise.all(ops as Promise<unknown>[])) as never);
}

const ADMIN = { id: "admin", orgId: "org1", role: "admin" as const };
const shared = {
  baseCategoryId: "b1", categoryId: "c1", itemName: "Laptop", invoiceNumber: "INV-1",
  price: 1000, purchaseDate: "2026-01-01", location: "HQ", condition: "New",
};
const body = (units: { itemCode: string; serialNumber: string }[]) => ({ shared, units });

describe("POST /api/assets/bulk", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await POST(makeReq("/api/assets/bulk", { method: "POST", body: body([{ itemCode: "A", serialNumber: "S1" }]) }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("403s a caller without Asset:create", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantNoCreate();
    const res = await POST(makeReq("/api/assets/bulk", { method: "POST", body: body([{ itemCode: "A", serialNumber: "S1" }]) }), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.astAsset.create).not.toHaveBeenCalled();
  });

  it("400s an empty units array", async () => {
    setSession(ADMIN);
    grantAll();
    const res = await POST(makeReq("/api/assets/bulk", { method: "POST", body: body([]) }), { params: {} });
    expect(res.status).toBe(400);
  });

  it("409s an intra-batch duplicate WITHOUT creating anything", async () => {
    setSession(ADMIN);
    grantAll();
    const res = await POST(makeReq("/api/assets/bulk", {
      method: "POST",
      body: body([{ itemCode: "LAP-1", serialNumber: "S1" }, { itemCode: "LAP-1", serialNumber: "S2" }]),
    }), { params: {} });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("LAP-1");
    expect(mockDb.astAsset.create).not.toHaveBeenCalled();
  });

  it("409s when an itemCode already exists in the org (no partial create)", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAsset.findMany.mockResolvedValue([{ itemCode: "LAP-1", serialNumber: "ZZZ" }] as never);
    const res = await POST(makeReq("/api/assets/bulk", { method: "POST", body: body([{ itemCode: "LAP-1", serialNumber: "S1" }]) }), { params: {} });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("already exists");
    expect(mockDb.astAsset.create).not.toHaveBeenCalled();
  });

  it("creates every unit atomically for a clean batch, defaulting assetType", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astAsset.findMany.mockResolvedValue([] as never);
    mockDb.astAsset.create.mockResolvedValue({ id: "a", itemName: "Laptop" } as never);
    const units = [
      { itemCode: "LAP-1", serialNumber: "S1" },
      { itemCode: "LAP-2", serialNumber: "S2" },
      { itemCode: "LAP-3", serialNumber: "S3" },
    ];
    const res = await POST(makeReq("/api/assets/bulk", { method: "POST", body: body(units) }), { params: {} });
    expect(res.status).toBe(201);
    expect(mockDb.astAsset.create).toHaveBeenCalledTimes(3);
    expect((await res.json()).data).toHaveLength(3);
    const call = mockDb.astAsset.create.mock.calls[0]?.[0] as { data: { assetType: string; orgId: string; createdByUserId: string } };
    expect(call.data.assetType).toBe("Fixed");
    expect(call.data.orgId).toBe("org1");
    expect(call.data.createdByUserId).toBe("admin"); // actor stamped on every unit
  });

  it("400s a batch over the max quantity", async () => {
    setSession(ADMIN);
    grantAll();
    const units = Array.from({ length: 51 }, (_, i) => ({ itemCode: `C${i}`, serialNumber: `S${i}` }));
    const res = await POST(makeReq("/api/assets/bulk", { method: "POST", body: body(units) }), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astAsset.create).not.toHaveBeenCalled();
  });

  it("400s when a shared required field (price) is missing", async () => {
    setSession(ADMIN);
    grantAll();
    const { price: _omit, ...noPrice } = shared;
    const res = await POST(makeReq("/api/assets/bulk", { method: "POST", body: { shared: noPrice, units: [{ itemCode: "A", serialNumber: "S1" }] } }), { params: {} });
    expect(res.status).toBe(400);
  });
});
