import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { GET, POST as CREATE } from "@/app/api/repair-requests/route";
import { POST as DECIDE } from "@/app/api/repair-requests/[id]/decision/route";
import { POST as FULFIL } from "@/app/api/repair-requests/[id]/fulfil/route";

/** Configure the RBAC gate to allow only the actions for which `allow` is true. */
function grant(allow: (action: string) => boolean) {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockImplementation((args) => {
    const action = (args as { where?: { action?: string } })?.where?.action;
    return Promise.resolve(action && allow(action) ? { id: "perm" } : null) as never;
  });
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}
const grantApprover = () => grant((a) => ["view", "viewAll", "approve"].includes(a));
const grantRequester = () => grant((a) => a === "view" || a === "create"); // no viewAll/approve

/** Run the transaction callback against the mock db (no real tx). */
function runTxInline() {
  mockDb.$transaction.mockImplementation((async (fn: unknown) =>
    (fn as (tx: typeof mockDb) => unknown)(mockDb)) as never);
}

const ADMIN = { id: "admin", orgId: "org1", role: "admin" as const };
const MEMBER = { id: "u1", orgId: "org1", role: "member" as const, email: "u1@x.com" };

describe("GET /api/repair-requests — queue scoping", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET(makeReq("/api/repair-requests"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("403s a caller without RepairRequest:view", async () => {
    setSession(MEMBER);
    grant(() => false);
    const res = await GET(makeReq("/api/repair-requests"), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.astRepairRequest.findMany).not.toHaveBeenCalled();
  });

  it("returns the FULL queue for a viewAll holder (no requester filter)", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findMany.mockResolvedValue([
      { id: "r1", requesterUserId: "u1", asset: null },
      { id: "r2", requesterUserId: "u2", asset: null },
    ] as never);
    mockDb.astEmployee.findMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("/api/repair-requests"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(2);
    const call = mockDb.astRepairRequest.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; requesterUserId?: string };
    };
    expect(call.where.orgId).toBe("org1");
    expect(call.where.requesterUserId).toBeUndefined(); // unscoped
  });

  it("scopes a non-viewAll caller to their own requests", async () => {
    setSession(MEMBER);
    grantRequester();
    mockDb.astRepairRequest.findMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("/api/repair-requests"), { params: {} });
    expect(res.status).toBe(200);
    const call = mockDb.astRepairRequest.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; requesterUserId?: string };
    };
    expect(call.where.requesterUserId).toBe("u1");
  });

  it("?mine=1 force-scopes even a viewAll holder to their own requests", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("/api/repair-requests?mine=1"), { params: {} });
    expect(res.status).toBe(200);
    const call = mockDb.astRepairRequest.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; requesterUserId?: string };
    };
    expect(call.where.requesterUserId).toBe("admin"); // scoped despite viewAll
  });

  it("resolves requester name + asset name/code for display", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findMany.mockResolvedValue([
      { id: "r1", requesterUserId: "u9", asset: { itemName: "MacBook", itemCode: "AST-1", category: { name: "Laptop" } } },
    ] as never);
    mockDb.astEmployee.findMany.mockResolvedValue([
      { userId: "u9", name: "Nadia", employeeId: "EMP-0009" },
    ] as never);

    const res = await GET(makeReq("/api/repair-requests"), { params: {} });
    const json = await res.json();
    expect(json.data[0].requesterName).toBe("Nadia");
    expect(json.data[0].requesterEmployeeId).toBe("EMP-0009");
    expect(json.data[0].assetName).toBe("MacBook");
    expect(json.data[0].assetCode).toBe("AST-1");
    expect(json.data[0].assetCategoryName).toBe("Laptop");
    // The joined relation is stripped from the DTO.
    expect(json.data[0].asset).toBeUndefined();
  });

  it("400s on an invalid status filter", async () => {
    setSession(ADMIN);
    grantApprover();
    const res = await GET(makeReq("/api/repair-requests?status=Bogus"), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astRepairRequest.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/repair-requests — raise a repair request", () => {
  beforeEach(() => resetMockDb());

  const validBody = {
    assetId: "a1",
    issueTitle: "Screen flickers",
    issueDescription: "Display cuts out after a few minutes.",
    urgency: "High",
  };

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await CREATE(makeReq("/api/repair-requests", { method: "POST", body: validBody }), { params: {} });
    expect(res.status).toBe(401);
  });

  it("403s a caller without RepairRequest:create", async () => {
    setSession(MEMBER);
    grant((a) => a === "view"); // view but not create
    const res = await CREATE(makeReq("/api/repair-requests", { method: "POST", body: validBody }), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.astRepairRequest.create).not.toHaveBeenCalled();
  });

  it("403s when the caller has no linked employee record", async () => {
    setSession(MEMBER);
    grantRequester();
    mockDb.astEmployee.findFirst.mockResolvedValue(null as never); // employeeIdForEmail → null
    const res = await CREATE(makeReq("/api/repair-requests", { method: "POST", body: validBody }), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.astRepairRequest.create).not.toHaveBeenCalled();
  });

  it("403s when the chosen asset is not actively assigned to the caller (IDOR guard)", async () => {
    setSession(MEMBER);
    grantRequester();
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
    mockDb.astAssignment.findFirst.mockResolvedValue(null as never); // not assigned to caller
    const res = await CREATE(makeReq("/api/repair-requests", { method: "POST", body: validBody }), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.astRepairRequest.create).not.toHaveBeenCalled();
    // Ownership check is scoped to the caller's employee + org.
    const call = mockDb.astAssignment.findFirst.mock.calls[0]?.[0] as {
      where: { orgId: string; assetId: string; userId: string; status: string };
    };
    expect(call.where).toMatchObject({ orgId: "org1", assetId: "a1", userId: "emp1", status: "Active" });
  });

  it("creates a Submitted request owned by the caller for their assigned asset", async () => {
    setSession(MEMBER);
    grantRequester();
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
    mockDb.astAssignment.findFirst.mockResolvedValue({ id: "asg1" } as never);
    mockDb.astRepairRequest.create.mockResolvedValue({ id: "rr1", status: "Submitted" } as never);

    const res = await CREATE(makeReq("/api/repair-requests", { method: "POST", body: validBody }), { params: {} });
    expect(res.status).toBe(201);
    const call = mockDb.astRepairRequest.create.mock.calls[0]?.[0] as {
      data: { orgId: string; requesterUserId: string; assetId: string; status: string; urgency: string; issueTitle: string };
    };
    expect(call.data).toMatchObject({
      orgId: "org1",
      requesterUserId: "u1",
      assetId: "a1",
      status: "Submitted",
      urgency: "High",
      issueTitle: "Screen flickers",
    });
  });

  it("400s when the issue title is missing", async () => {
    setSession(MEMBER);
    grantRequester();
    const { issueTitle: _omit, ...noTitle } = validBody;
    const res = await CREATE(makeReq("/api/repair-requests", { method: "POST", body: noTitle }), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astRepairRequest.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/repair-requests/[id]/decision", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await DECIDE(makeReq("/api/repair-requests/r1/decision", { method: "POST", body: { action: "approve" } }), { params: { id: "r1" } });
    expect(res.status).toBe(401);
  });

  it("403s a caller without RepairRequest:approve", async () => {
    setSession(MEMBER);
    grantRequester();
    const res = await DECIDE(makeReq("/api/repair-requests/r1/decision", { method: "POST", body: { action: "approve" } }), { params: { id: "r1" } });
    expect(res.status).toBe(403);
    expect(mockDb.astRepairRequest.update).not.toHaveBeenCalled();
  });

  it("approves a Submitted request", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findFirst.mockResolvedValue({ id: "r1", status: "Submitted", issueTitle: "Screen" } as never);
    mockDb.astRepairRequest.update.mockResolvedValue({ id: "r1", status: "Approved" } as never);

    const res = await DECIDE(makeReq("/api/repair-requests/r1/decision", { method: "POST", body: { action: "approve", note: "ok" } }), { params: { id: "r1" } });
    expect(res.status).toBe(200);
    const call = mockDb.astRepairRequest.update.mock.calls[0]?.[0] as { data: { status: string; reviewedByUserId: string } };
    expect(call.data.status).toBe("Approved");
    expect(call.data.reviewedByUserId).toBe("admin");
  });

  it("rejects with a reason", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findFirst.mockResolvedValue({ id: "r1", status: "Submitted", issueTitle: "Screen" } as never);
    mockDb.astRepairRequest.update.mockResolvedValue({ id: "r1", status: "Rejected" } as never);

    const res = await DECIDE(makeReq("/api/repair-requests/r1/decision", { method: "POST", body: { action: "reject", note: "not a hardware fault" } }), { params: { id: "r1" } });
    expect(res.status).toBe(200);
    const call = mockDb.astRepairRequest.update.mock.calls[0]?.[0] as { data: { status: string; decisionNote: string } };
    expect(call.data.status).toBe("Rejected");
    expect(call.data.decisionNote).toBe("not a hardware fault");
  });

  it("400s rejecting without a reason", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findFirst.mockResolvedValue({ id: "r1", status: "Submitted", issueTitle: "Screen" } as never);
    const res = await DECIDE(makeReq("/api/repair-requests/r1/decision", { method: "POST", body: { action: "reject" } }), { params: { id: "r1" } });
    expect(res.status).toBe(400);
    expect(mockDb.astRepairRequest.update).not.toHaveBeenCalled();
  });

  it("409s approving a request that is not Submitted (already Approved)", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findFirst.mockResolvedValue({ id: "r1", status: "Approved", issueTitle: "Screen" } as never);
    const res = await DECIDE(makeReq("/api/repair-requests/r1/decision", { method: "POST", body: { action: "approve" } }), { params: { id: "r1" } });
    expect(res.status).toBe(409);
  });

  it("allows rejecting an already-Approved request (back out before send-to-repair)", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findFirst.mockResolvedValue({ id: "r1", status: "Approved", issueTitle: "Screen" } as never);
    mockDb.astRepairRequest.update.mockResolvedValue({ id: "r1", status: "Rejected" } as never);
    const res = await DECIDE(makeReq("/api/repair-requests/r1/decision", { method: "POST", body: { action: "reject", note: "duplicate" } }), { params: { id: "r1" } });
    expect(res.status).toBe(200);
    const call = mockDb.astRepairRequest.update.mock.calls[0]?.[0] as { data: { status: string } };
    expect(call.data.status).toBe("Rejected");
  });

  it("409s rejecting a Fulfilled request (holds a live repair record)", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findFirst.mockResolvedValue({ id: "r1", status: "Fulfilled", issueTitle: "Screen" } as never);
    const res = await DECIDE(makeReq("/api/repair-requests/r1/decision", { method: "POST", body: { action: "reject", note: "changed my mind" } }), { params: { id: "r1" } });
    expect(res.status).toBe(409);
    expect(mockDb.astRepairRequest.update).not.toHaveBeenCalled();
  });

  it("404s + scopes the lookup to the caller's org (tenant isolation)", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findFirst.mockResolvedValue(null as never);
    const res = await DECIDE(makeReq("/api/repair-requests/r1/decision", { method: "POST", body: { action: "approve" } }), { params: { id: "r1" } });
    expect(res.status).toBe(404);
    const call = mockDb.astRepairRequest.findFirst.mock.calls[0]?.[0] as { where: { id: string; orgId: string } };
    expect(call.where.orgId).toBe("org1");
  });
});

describe("POST /api/repair-requests/[id]/fulfil — send to repair", () => {
  beforeEach(() => resetMockDb());

  const body = { sentDate: "2026-07-20" };

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await FULFIL(makeReq("/api/repair-requests/r1/fulfil", { method: "POST", body }), { params: { id: "r1" } });
    expect(res.status).toBe(401);
  });

  it("403s a caller without RepairRequest:approve", async () => {
    setSession(MEMBER);
    grantRequester();
    const res = await FULFIL(makeReq("/api/repair-requests/r1/fulfil", { method: "POST", body }), { params: { id: "r1" } });
    expect(res.status).toBe(403);
  });

  it("409s sending a request that isn't Approved", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findFirst.mockResolvedValue({ id: "r1", status: "Submitted", assetId: "a1" } as never);
    const res = await FULFIL(makeReq("/api/repair-requests/r1/fulfil", { method: "POST", body }), { params: { id: "r1" } });
    expect(res.status).toBe(409);
  });

  it("400s when sentDate is missing", async () => {
    setSession(ADMIN);
    grantApprover();
    const res = await FULFIL(makeReq("/api/repair-requests/r1/fulfil", { method: "POST", body: {} }), { params: { id: "r1" } });
    expect(res.status).toBe(400);
  });

  it("404s when the asset no longer exists", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findFirst.mockResolvedValue({ id: "r1", status: "Approved", assetId: "a1", issueTitle: "Screen", issueDescription: "x" } as never);
    mockDb.astAsset.findFirst.mockResolvedValue(null as never);
    const res = await FULFIL(makeReq("/api/repair-requests/r1/fulfil", { method: "POST", body }), { params: { id: "r1" } });
    expect(res.status).toBe(404);
  });

  it("409s when the asset is already InRepair", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findFirst.mockResolvedValue({ id: "r1", status: "Approved", assetId: "a1", issueTitle: "Screen", issueDescription: "x" } as never);
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "InRepair", itemName: "MacBook" } as never);
    const res = await FULFIL(makeReq("/api/repair-requests/r1/fulfil", { method: "POST", body }), { params: { id: "r1" } });
    expect(res.status).toBe(409);
    expect(mockDb.astRepair.create).not.toHaveBeenCalled();
  });

  it("404s when the vendor is not in the caller's org (cross-org guard)", async () => {
    setSession(ADMIN);
    grantApprover();
    mockDb.astRepairRequest.findFirst.mockResolvedValue({ id: "r1", status: "Approved", assetId: "a1", issueTitle: "Screen", issueDescription: "x" } as never);
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Assigned", itemName: "MacBook" } as never);
    mockDb.astVendor.findFirst.mockResolvedValue(null as never);
    const res = await FULFIL(makeReq("/api/repair-requests/r1/fulfil", { method: "POST", body: { ...body, vendorId: "v-other" } }), { params: { id: "r1" } });
    expect(res.status).toBe(404);
    expect(mockDb.astRepair.create).not.toHaveBeenCalled();
  });

  it("creates the repair, flips the asset to InRepair, links + marks the request Fulfilled", async () => {
    setSession(ADMIN);
    grantApprover();
    runTxInline();
    mockDb.astRepairRequest.findFirst.mockResolvedValue({
      id: "r1", status: "Approved", assetId: "a1", issueTitle: "Screen flickers", issueDescription: "cuts out",
    } as never);
    mockDb.astAsset.findFirst.mockResolvedValue({ id: "a1", assetStatus: "Assigned", itemName: "MacBook" } as never);
    mockDb.astRepair.create.mockResolvedValue({ id: "rep1" } as never);
    mockDb.astAsset.update.mockResolvedValue({ id: "a1" } as never);
    mockDb.astRepairRequest.update.mockResolvedValue({ id: "r1", status: "Fulfilled", repairId: "rep1" } as never);

    const res = await FULFIL(makeReq("/api/repair-requests/r1/fulfil", { method: "POST", body: { ...body, vendorId: null, estimatedCost: 120 } }), { params: { id: "r1" } });
    expect(res.status).toBe(201);

    const repairData = mockDb.astRepair.create.mock.calls[0]?.[0] as {
      data: { orgId: string; assetId: string; issueTitle: string; status: string; estimatedCost: number };
    };
    expect(repairData.data).toMatchObject({
      orgId: "org1",
      assetId: "a1",
      issueTitle: "Screen flickers",
      status: "InRepair",
      estimatedCost: 120,
    });
    const assetUpd = mockDb.astAsset.update.mock.calls[0]?.[0] as { data: { assetStatus: string } };
    expect(assetUpd.data.assetStatus).toBe("InRepair");
    const reqUpd = mockDb.astRepairRequest.update.mock.calls[0]?.[0] as { data: { status: string; repairId: string } };
    expect(reqUpd.data).toMatchObject({ status: "Fulfilled", repairId: "rep1" });
  });
});
