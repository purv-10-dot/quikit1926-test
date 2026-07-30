import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { POST } from "@/app/api/assignments/bulk/route";

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
/** Run the callback-form $transaction against the mock db. */
function runTxInline() {
  mockDb.$transaction.mockImplementation((async (fn: unknown) => (fn as (tx: typeof mockDb) => unknown)(mockDb)) as never);
}
const ADMIN = { id: "admin", orgId: "org1", role: "admin" as const };
const dataOf = (call: unknown) => (call as { data: Record<string, unknown> }).data;
const body = (over: Record<string, unknown> = {}) => ({ userId: "e1", assetIds: ["a1", "a2"], assignedDate: "2026-07-17", ...over });

// No org member for "e1" → the resolver falls back to treating it as an existing
// AstEmployee.id, which these tests mock.
function resolveToEmployee(id = "e1") {
  mockDb.orgMember.findFirst.mockResolvedValue(null as never);
  mockDb.astEmployee.findFirst.mockResolvedValue({ id } as never);
}

describe("POST /api/assignments/bulk", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await POST(makeReq("/api/assignments/bulk", { method: "POST", body: body() }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("403s a caller without Assignment:create", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantNoCreate();
    const res = await POST(makeReq("/api/assignments/bulk", { method: "POST", body: body() }), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.astAssignment.create).not.toHaveBeenCalled();
  });

  it("400s an empty assetIds array", async () => {
    setSession(ADMIN);
    grantAll();
    const res = await POST(makeReq("/api/assignments/bulk", { method: "POST", body: body({ assetIds: [] }) }), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astAssignment.create).not.toHaveBeenCalled();
  });

  it("400s when assignedDate is missing", async () => {
    setSession(ADMIN);
    grantAll();
    const res = await POST(makeReq("/api/assignments/bulk", { method: "POST", body: body({ assignedDate: undefined }) }), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astAssignment.create).not.toHaveBeenCalled();
  });

  it("409s when the same asset is selected twice (no writes)", async () => {
    setSession(ADMIN);
    grantAll();
    const res = await POST(makeReq("/api/assignments/bulk", { method: "POST", body: body({ assetIds: ["a1", "a1"] }) }), { params: {} });
    expect(res.status).toBe(409);
    expect(mockDb.astAssignment.create).not.toHaveBeenCalled();
  });

  it("404s when a selected asset is not found (no partial write)", async () => {
    setSession(ADMIN);
    grantAll();
    resolveToEmployee();
    // Only a1 comes back; a2 is missing.
    mockDb.astAsset.findMany.mockResolvedValue([{ id: "a1", assetStatus: "Available", condition: "Good", itemName: "L1" }] as never);
    const res = await POST(makeReq("/api/assignments/bulk", { method: "POST", body: body() }), { params: {} });
    expect(res.status).toBe(404);
    expect(mockDb.astAssignment.create).not.toHaveBeenCalled();
  });

  it("409s when any selected asset is not Available (no partial write)", async () => {
    setSession(ADMIN);
    grantAll();
    resolveToEmployee();
    mockDb.astAsset.findMany.mockResolvedValue([
      { id: "a1", assetStatus: "Available", condition: "Good", itemName: "L1" },
      { id: "a2", assetStatus: "Assigned", condition: "Fair", itemName: "L2" },
    ] as never);
    const res = await POST(makeReq("/api/assignments/bulk", { method: "POST", body: body() }), { params: {} });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("L2");
    expect(mockDb.astAssignment.create).not.toHaveBeenCalled();
    expect(mockDb.astAsset.updateMany).not.toHaveBeenCalled();
  });

  it("201s: creates every assignment and flips every asset atomically", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    resolveToEmployee();
    mockDb.astAsset.findMany.mockResolvedValue([
      { id: "a1", assetStatus: "Available", condition: "Good", itemName: "L1" },
      { id: "a2", assetStatus: "Available", condition: "Fair", itemName: "L2" },
    ] as never);
    mockDb.astAssignment.create.mockResolvedValue({ id: "as", asset: { itemName: "L" }, user: { name: "N" } } as never);
    mockDb.astAsset.updateMany.mockResolvedValue({ count: 2 } as never);
    const res = await POST(makeReq("/api/assignments/bulk", { method: "POST", body: body() }), { params: {} });
    expect(res.status).toBe(201);
    expect((await res.json()).data).toHaveLength(2);
    expect(mockDb.astAssignment.create).toHaveBeenCalledTimes(2);
    // Every assignment gets the resolved employee id + inherits the asset condition + persists the date.
    expect(dataOf(mockDb.astAssignment.create.mock.calls[0]?.[0]).userId).toBe("e1");
    expect(dataOf(mockDb.astAssignment.create.mock.calls[0]?.[0]).assignedByUserId).toBe("admin"); // actor stamped
    expect(dataOf(mockDb.astAssignment.create.mock.calls[0]?.[0]).condition).toBe("Good");
    expect(dataOf(mockDb.astAssignment.create.mock.calls[0]?.[0]).assignedAt).toBeInstanceOf(Date);
    expect(dataOf(mockDb.astAssignment.create.mock.calls[1]?.[0]).condition).toBe("Fair");
    expect(mockDb.astAsset.updateMany).toHaveBeenCalledTimes(1);
    expect(dataOf(mockDb.astAsset.updateMany.mock.calls[0]?.[0]).assetStatus).toBe("Assigned");
  });
});
