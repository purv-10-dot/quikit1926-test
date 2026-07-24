import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { GET, POST } from "@/app/api/repairs/route";

function grantAll() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockResolvedValue({ id: "perm" } as never);
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}
function runTxInline() {
  mockDb.$transaction.mockImplementation((async (fn: unknown) => (fn as (tx: typeof mockDb) => unknown)(mockDb)) as never);
}
const ADMIN = { id: "admin", orgId: "org1", role: "admin" as const };
const body = { assetId: "a1", issueTitle: "Screen broken", issueDescription: "Cracked", sentDate: "2026-07-20" };

describe("POST /api/repairs — actor attribution (Sent to repair by)", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await POST(makeReq("/api/repairs", { method: "POST", body }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("stamps createdByUserId with the session user and flips the asset InRepair", async () => {
    setSession(ADMIN);
    grantAll();
    runTxInline();
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1" } as never);
    mockDb.astRepair.create.mockResolvedValue({ id: "rep1", assetId: "a1", asset: { itemName: "Laptop" } } as never);
    mockDb.astAsset.update.mockResolvedValue({} as never);

    const res = await POST(makeReq("/api/repairs", { method: "POST", body }), { params: {} });
    expect(res.status).toBe(201);
    const call = mockDb.astRepair.create.mock.calls[0]?.[0] as { data: { createdByUserId: string; status: string } };
    expect(call.data.createdByUserId).toBe("admin");
    expect(call.data.status).toBe("InRepair");
    const assetUpd = mockDb.astAsset.update.mock.calls[0]?.[0] as { data: { assetStatus: string } };
    expect(assetUpd.data.assetStatus).toBe("InRepair");
  });
});

describe("GET /api/repairs — actor name resolution", () => {
  beforeEach(() => resetMockDb());

  it("resolves sentByName from the User table", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astRepair.findMany.mockResolvedValue([
      { id: "rep1", createdByUserId: "admin", asset: null, vendorRef: null },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([{ id: "admin", firstName: "Ada", lastName: "Admin", email: "ada@x.com" }] as never);

    const res = await GET(makeReq("/api/repairs"), { params: {} });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data[0].sentByName).toBe("Ada Admin");
  });

  it("returns sentByName null for a legacy repair with no actor", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astRepair.findMany.mockResolvedValue([
      { id: "rep1", createdByUserId: null, asset: null, vendorRef: null },
    ] as never);

    const res = await GET(makeReq("/api/repairs"), { params: {} });
    const json = await res.json();
    expect(json.data[0].sentByName).toBeNull();
    expect(mockDb.user.findMany).not.toHaveBeenCalled();
  });
});
