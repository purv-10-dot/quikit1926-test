import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { POST } from "@/app/api/replacements/route";

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
const body = { repairId: "r1", assetId: "a1", userId: "u1", type: "Temporary", startDate: "2026-07-17", endDate: "2026-08-17" };

describe("POST /api/replacements — assignee resolution", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await POST(makeReq("/api/replacements", { method: "POST", body }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("resolves a platform userId to its linked employee and stores that id", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astRepair.findFirst.mockResolvedValue({ id: "r1" } as never);
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ status: "active", user: { firstName: "Jane", lastName: "Doe", email: "jane@x.com" } } as never);
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1", userId: "u1" } as never);
    mockDb.astReplacement.create.mockResolvedValue({ id: "rp1", asset: { itemName: "L" }, user: { name: "N" } } as never);
    mockDb.astAsset.update.mockResolvedValue({} as never);
    const res = await POST(makeReq("/api/replacements", { method: "POST", body }), { params: {} });
    expect(res.status).toBe(201);
    // The stored userId must be the AstEmployee.id — the recovery flow reuses it
    // verbatim as an assignment FK.
    expect(dataOf(mockDb.astReplacement.create.mock.calls[0]?.[0]).userId).toBe("emp1");
    expect(dataOf(mockDb.astAsset.update.mock.calls[0]?.[0]).assetStatus).toBe("Assigned");
  });

  it("accepts an existing AstEmployee.id (repairs auto-fill fallback)", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astRepair.findFirst.mockResolvedValue({ id: "r1" } as never);
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue(null as never); // not a platform user
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "e1" } as never); // existing employee id
    mockDb.astReplacement.create.mockResolvedValue({ id: "rp1", asset: { itemName: "L" }, user: { name: "N" } } as never);
    mockDb.astAsset.update.mockResolvedValue({} as never);
    const res = await POST(makeReq("/api/replacements", { method: "POST", body: { ...body, userId: "e1" } }), { params: {} });
    expect(res.status).toBe(201);
    expect(dataOf(mockDb.astReplacement.create.mock.calls[0]?.[0]).userId).toBe("e1");
  });

  it("404s when the assignee is neither an org member nor an employee", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astRepair.findFirst.mockResolvedValue({ id: "r1" } as never);
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue(null as never);
    mockDb.astEmployee.findFirst.mockResolvedValue(null as never);
    const res = await POST(makeReq("/api/replacements", { method: "POST", body }), { params: {} });
    expect(res.status).toBe(404);
    expect(mockDb.astReplacement.create).not.toHaveBeenCalled();
  });
});
