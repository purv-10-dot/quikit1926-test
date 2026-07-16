import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { POST } from "@/app/api/assignments/route";
import { PATCH, DELETE } from "@/app/api/assignments/[id]/route";

function grantAll() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockResolvedValue({ id: "perm" } as never);
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}
/** Run the callback-form $transaction against the mock db. */
function runTxInline() {
  mockDb.$transaction.mockImplementation((async (fn: unknown) => (fn as (tx: typeof mockDb) => unknown)(mockDb)) as never);
}
const ADMIN = { id: "admin", orgId: "org1", role: "admin" as const };
const dataOf = (call: unknown) => (call as { data: Record<string, unknown> }).data;

describe("POST /api/assignments — assign guard (A2)", () => {
  beforeEach(() => resetMockDb());
  const body = { assetId: "a1", userId: "e1", condition: "Good" };

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await POST(makeReq("/api/assignments", { method: "POST", body }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("409s when the chosen asset is not Available", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Assigned" } as never);
    const res = await POST(makeReq("/api/assignments", { method: "POST", body }), { params: {} });
    expect(res.status).toBe(409);
    expect(mockDb.astAssignment.create).not.toHaveBeenCalled();
  });

  it("201s and marks the asset Assigned when Available", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Available" } as never);
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "e1" } as never);
    mockDb.astAssignment.create.mockResolvedValue({ id: "as1", assetId: "a1", asset: { itemName: "L" }, user: { name: "N" } } as never);
    mockDb.astAsset.update.mockResolvedValue({} as never);
    const res = await POST(makeReq("/api/assignments", { method: "POST", body }), { params: {} });
    expect(res.status).toBe(201);
    expect(dataOf(mockDb.astAsset.update.mock.calls[0]?.[0]).assetStatus).toBe("Assigned");
  });
});

describe("PATCH /api/assignments/[id] — return (A1/A3/A4)", () => {
  beforeEach(() => resetMockDb());
  const patchReq = () => makeReq("/api/assignments/as1", { method: "PATCH" });

  it("returns an active assignment: frees the asset, no linked request", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astAssignment.findFirst.mockResolvedValue({ id: "as1", status: "Active", assetId: "a1", requestId: null } as never);
    mockDb.astAssignment.update.mockResolvedValue({ id: "as1", assetId: "a1", asset: { assetStatus: "Assigned", itemName: "L" }, user: { name: "N" } } as never);
    mockDb.astAsset.update.mockResolvedValue({} as never);
    const res = await PATCH(patchReq(), { params: { id: "as1" } });
    expect(res.status).toBe(200);
    expect(dataOf(mockDb.astAsset.update.mock.calls[0]?.[0]).assetStatus).toBe("Available");
    expect(mockDb.astAssetRequest.update).not.toHaveBeenCalled();
  });

  it("is idempotent — returning an already-returned assignment 409s with no side effects", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAssignment.findFirst.mockResolvedValue({ id: "as1", status: "Returned", assetId: "a1", requestId: null } as never);
    const res = await PATCH(patchReq(), { params: { id: "as1" } });
    expect(res.status).toBe(409);
    expect(mockDb.astAssignment.update).not.toHaveBeenCalled();
    expect(mockDb.astAsset.update).not.toHaveBeenCalled();
  });

  it("does NOT flip an InRepair asset to Available (A4)", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astAssignment.findFirst.mockResolvedValue({ id: "as1", status: "Active", assetId: "a1", requestId: null } as never);
    mockDb.astAssignment.update.mockResolvedValue({ id: "as1", assetId: "a1", asset: { assetStatus: "InRepair", itemName: "L" }, user: { name: "N" } } as never);
    const res = await PATCH(patchReq(), { params: { id: "as1" } });
    expect(res.status).toBe(200);
    expect(mockDb.astAsset.update).not.toHaveBeenCalled();
  });

  it("reverts the linked request on return (A3)", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astAssignment.findFirst.mockResolvedValue({ id: "as1", status: "Active", assetId: "a1", requestId: "r1" } as never);
    mockDb.astAssignment.update.mockResolvedValue({ id: "as1", assetId: "a1", asset: { assetStatus: "Assigned", itemName: "L" }, user: { name: "N" } } as never);
    mockDb.astAsset.update.mockResolvedValue({} as never);
    mockDb.astAssetRequest.findUnique.mockResolvedValue({ quantityFulfilled: 1, status: "Fulfilled" } as never);
    mockDb.astAssetRequest.update.mockResolvedValue({} as never);
    const res = await PATCH(patchReq(), { params: { id: "as1" } });
    expect(res.status).toBe(200);
    expect(dataOf(mockDb.astAssetRequest.update.mock.calls[0]?.[0])).toMatchObject({ quantityFulfilled: 0, status: "Approved" });
  });
});

describe("DELETE /api/assignments/[id] — cleanup (A1/A3)", () => {
  beforeEach(() => resetMockDb());
  const delReq = () => makeReq("/api/assignments/as1", { method: "DELETE" });

  it("deleting an ACTIVE assignment frees the asset and reverts the request", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astAssignment.findFirst.mockResolvedValue({
      id: "as1", status: "Active", assetId: "a1", requestId: "r1",
      asset: { assetStatus: "Assigned", itemName: "L" }, user: { name: "N" },
    } as never);
    mockDb.astAssignment.delete.mockResolvedValue({} as never);
    mockDb.astAsset.update.mockResolvedValue({} as never);
    mockDb.astAssetRequest.findUnique.mockResolvedValue({ quantityFulfilled: 2, status: "PartiallyFulfilled" } as never);
    mockDb.astAssetRequest.update.mockResolvedValue({} as never);
    const res = await DELETE(delReq(), { params: { id: "as1" } });
    expect(res.status).toBe(200);
    expect(dataOf(mockDb.astAsset.update.mock.calls[0]?.[0]).assetStatus).toBe("Available");
    expect(dataOf(mockDb.astAssetRequest.update.mock.calls[0]?.[0])).toMatchObject({ quantityFulfilled: 1, status: "PartiallyFulfilled" });
  });

  it("deleting a RETURNED assignment leaves the asset + request untouched", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astAssignment.findFirst.mockResolvedValue({
      id: "as1", status: "Returned", assetId: "a1", requestId: "r1",
      asset: { assetStatus: "Available", itemName: "L" }, user: { name: "N" },
    } as never);
    mockDb.astAssignment.delete.mockResolvedValue({} as never);
    const res = await DELETE(delReq(), { params: { id: "as1" } });
    expect(res.status).toBe(200);
    expect(mockDb.astAsset.update).not.toHaveBeenCalled();
    expect(mockDb.astAssetRequest.update).not.toHaveBeenCalled();
  });
});
