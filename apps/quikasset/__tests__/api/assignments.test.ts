import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { GET, POST } from "@/app/api/assignments/route";
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
  const body = { assetId: "a1", userId: "e1", assignedDate: "2026-07-17" };

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
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Available", condition: "New" } as never);
    // No matching org member → resolver falls back to treating userId as an
    // existing AstEmployee.id (repairs auto-fill / legacy path).
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "e1" } as never);
    mockDb.astAssignment.create.mockResolvedValue({ id: "as1", assetId: "a1", asset: { itemName: "L" }, user: { name: "N" } } as never);
    mockDb.astAsset.update.mockResolvedValue({} as never);
    const res = await POST(makeReq("/api/assignments", { method: "POST", body }), { params: {} });
    expect(res.status).toBe(201);
    expect(dataOf(mockDb.astAsset.update.mock.calls[0]?.[0]).assetStatus).toBe("Assigned");
    const created = dataOf(mockDb.astAssignment.create.mock.calls[0]?.[0]);
    expect(created.userId).toBe("e1");
    // Condition is inherited from the asset (no form field); assignedAt persists the date.
    expect(created.condition).toBe("New");
    expect(created.assignedAt).toBeInstanceOf(Date);
  });

  it("400s when assignedDate is missing", async () => {
    setSession(ADMIN);
    grantAll();
    const res = await POST(makeReq("/api/assignments", { method: "POST", body: { assetId: "a1", userId: "e1" } }), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astAssignment.create).not.toHaveBeenCalled();
  });

  it("resolves a platform userId to its existing linked employee", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Available", condition: "New" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ status: "active", user: { firstName: "Jane", lastName: "Doe", email: "jane@x.com" } } as never);
    // Same row answers ensureLinkedEmployee's "already linked?" check and the
    // resolver's id re-query.
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1", userId: "u1", employeeId: "EMP-0001" } as never);
    mockDb.astAssignment.create.mockResolvedValue({ id: "as1", asset: { itemName: "L" }, user: { name: "N" } } as never);
    mockDb.astAsset.update.mockResolvedValue({} as never);
    const res = await POST(makeReq("/api/assignments", { method: "POST", body: { assetId: "a1", userId: "u1", assignedDate: "2026-07-17" } }), { params: {} });
    expect(res.status).toBe(201);
    expect(dataOf(mockDb.astAssignment.create.mock.calls[0]?.[0]).userId).toBe("emp1");
    expect(mockDb.astEmployee.create).not.toHaveBeenCalled();
  });

  it("auto-creates an employee for a platform user who has none yet", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Available", condition: "New" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ status: "active", user: { firstName: "New", lastName: "Guy", email: "new@x.com" } } as never);
    mockDb.astEmployee.findFirst
      .mockResolvedValueOnce(null as never) // ensureLinkedEmployee: not already linked
      .mockResolvedValueOnce(null as never) // ensureLinkedEmployee: no unlinked match by email
      .mockResolvedValueOnce({ id: "empNew" } as never); // resolver id re-query
    mockDb.astEmployee.findMany.mockResolvedValue([] as never); // generateEmployeeId
    mockDb.astEmployee.create.mockResolvedValue({ id: "empNew", employeeId: "EMP-0001" } as never);
    mockDb.astAssignment.create.mockResolvedValue({ id: "as1", asset: { itemName: "L" }, user: { name: "N" } } as never);
    mockDb.astAsset.update.mockResolvedValue({} as never);
    const res = await POST(makeReq("/api/assignments", { method: "POST", body: { assetId: "a1", userId: "u2", assignedDate: "2026-07-17" } }), { params: {} });
    expect(res.status).toBe(201);
    expect(mockDb.astEmployee.create).toHaveBeenCalled();
    expect(dataOf(mockDb.astAssignment.create.mock.calls[0]?.[0]).userId).toBe("empNew");
  });

  it("404s when the assignee is neither an org member nor an employee", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Available", condition: "New" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue(null as never);
    mockDb.astEmployee.findFirst.mockResolvedValue(null as never);
    const res = await POST(makeReq("/api/assignments", { method: "POST", body }), { params: {} });
    expect(res.status).toBe(404);
    expect(mockDb.astAssignment.create).not.toHaveBeenCalled();
  });

  it("409s when the user's email is already linked to a different employee", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Available", condition: "New" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ status: "active", user: { firstName: "Dup", lastName: "User", email: "dup@x.com" } } as never);
    mockDb.astEmployee.findFirst
      .mockResolvedValueOnce(null as never) // not already linked to this user
      .mockResolvedValueOnce({ id: "e9", userId: "someone-else" } as never); // email linked elsewhere
    const res = await POST(makeReq("/api/assignments", { method: "POST", body: { assetId: "a1", userId: "u3", assignedDate: "2026-07-17" } }), { params: {} });
    expect(res.status).toBe(409);
    expect(mockDb.astAssignment.create).not.toHaveBeenCalled();
  });
});

describe("Actor attribution (Assigned by)", () => {
  beforeEach(() => resetMockDb());

  it("POST stamps assignedByUserId with the actor (session user), distinct from the assignee", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Available", condition: "New" } as never);
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "e1" } as never);
    mockDb.astAssignment.create.mockResolvedValue({ id: "as1", assetId: "a1", asset: { itemName: "L" }, user: { name: "N" } } as never);
    mockDb.astAsset.update.mockResolvedValue({} as never);

    const res = await POST(makeReq("/api/assignments", { method: "POST", body: { assetId: "a1", userId: "e1", assignedDate: "2026-07-17" } }), { params: {} });
    expect(res.status).toBe(201);
    const created = dataOf(mockDb.astAssignment.create.mock.calls[0]?.[0]);
    expect(created.assignedByUserId).toBe("admin"); // actor
    expect(created.userId).toBe("e1"); // assignee — unchanged
  });

  it("GET resolves assignedByName from the User table", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astAssignment.findMany.mockResolvedValue([
      { id: "as1", assignedByUserId: "admin", asset: null, user: null },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([{ id: "admin", firstName: "Ada", lastName: "Admin", email: "ada@x.com" }] as never);

    const res = await GET(makeReq("/api/assignments"), { params: {} });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data[0].assignedByName).toBe("Ada Admin");
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
