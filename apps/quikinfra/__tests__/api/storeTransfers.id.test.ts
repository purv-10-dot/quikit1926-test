import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/store/transfers/[id]/route";
import { POST as SUBMIT } from "@/app/api/store/transfers/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/store/transfers/[id]/approve/route";
import { POST as DISPATCH } from "@/app/api/store/transfers/[id]/dispatch/route";
import { POST as RECEIVE } from "@/app/api/store/transfers/[id]/receive/route";

const db = mockDb as any;
const ID = "st1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/store/transfers/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

function stRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    transferNumber: "ST-20260101-0001",
    sourceProjectId: "p1",
    destinationProjectId: "p2",
    toLocationName: "Dest Store",
    assetLines: [],
    status: "draft",
    approvalId: null,
    createdBy: TEST_USER,
    updatedBy: TEST_USER,
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.$queryRaw.mockResolvedValue([]);
  db.$executeRaw.mockResolvedValue(1);
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/store/transfers/[id]  (gate: construction.transfer.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/transfers/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.transfer.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when the transfer is not in this org", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the transfer with a null approval block when not submitted", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([stRow()]);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(ID);
    expect(body.approval).toBeNull();
  });
});

// ═══════════════════════════════════════════════
// PUT /api/store/transfers/[id]  (gate: construction.transfer.edit + matrix store.transfer:edit)
// ═══════════════════════════════════════════════

describe("PUT /api/store/transfers/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PUT(req("PUT", { remarks: "x" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.transfer.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await PUT(req("PUT", { remarks: "x" }), params)).status).toBe(403);
  });

  it("returns 404 when updating a missing row", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await PUT(req("PUT", { remarks: "x" }), params)).status).toBe(404);
  });

  it("updates editable fields and returns the patched row", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([stRow()]);
    const res = await PUT(req("PUT", { remarks: "note" }), params);
    expect(res.status).toBe(200);
    expect(db.$executeRaw).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/store/transfers/[id]  (gate: construction.transfer.delete + matrix store.transfer:delete)
// ═══════════════════════════════════════════════

describe("DELETE /api/store/transfers/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.transfer.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when deleting a missing row", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("deletes within the org and returns success", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([stRow()]);
    db.$executeRaw.mockResolvedValue(1);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/transfers/[id]/submit  (gate: construction.transfer.create + matrix store.transfer:edit)
// ═══════════════════════════════════════════════

describe("POST /api/store/transfers/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.transfer.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the transfer does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the transfer is not in draft", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([stRow({ status: "approved" })]);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([stRow()]);
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active stock transfer workflow/i);
  });

  it("submits and moves the transfer into pending_approval", async () => {
    setContext(makeUserCtx(["construction.transfer.create"]));
    db.$queryRaw.mockResolvedValue([stRow()]);
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "transfer",
      isActive: true,
      projectId: "p1",
      steps: [
        { stepOrder: 1, approverUserId: null, approverUserIds: null, approverRoleId: "SITE_ADMIN" },
      ],
    });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnApprovalInstance.create.mockResolvedValue({ id: "inst1" });
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approvalInstanceId).toBe("inst1");
    expect(body.autoApproved).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/transfers/[id]/approve  (gate: construction.transfer.approve + matrix store.transfer:edit)
// ═══════════════════════════════════════════════

describe("POST /api/store/transfers/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.transfer.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(403);
  });

  it("returns 404 when the transfer does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(404);
  });

  it("returns 400 on an unknown action", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([stRow({ approvalId: "inst1" })]);
    const res = await APPROVE(req("POST", { action: "frobnicate" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown action/i);
  });

  it("returns 400 when the transfer has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([stRow({ approvalId: null })]);
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("approves the final step and flips the transfer to approved", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.$queryRaw.mockResolvedValue([stRow({ approvalId: "inst1", status: "pending_approval" })]);
    db.cnApprovalInstance.findFirst.mockResolvedValue({
      id: "inst1",
      orgId: TEST_TENANT,
      workflowId: "wf1",
      status: "pending_approval",
      currentStepOrder: 1,
    });
    db.cnApprovalWorkflowStep.findFirst
      .mockResolvedValueOnce({ stepOrder: 1, approverUserId: null, approverRoleId: "SITE_ADMIN", approverUserIds: null }) // current step
      .mockResolvedValueOnce(null); // no next step → final
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnApprovalWorkflowStep.count.mockResolvedValue(1);
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("approve");
    expect(body.approval.status).toBe("approved");
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/transfers/[id]/dispatch  (gate: construction.transfer.edit + matrix store.transfer:edit)
// ═══════════════════════════════════════════════

describe("POST /api/store/transfers/[id]/dispatch", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DISPATCH(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.transfer.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await DISPATCH(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the transfer does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await DISPATCH(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the transfer is not approved", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([stRow({ status: "draft" })]);
    const res = await DISPATCH(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/only approved transfers can be dispatched/i);
  });

  it("dispatches an approved transfer", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([stRow({ status: "approved" })]);
    const res = await DISPATCH(req("POST", { vehicleNo: "MH-01" }), params);
    expect(res.status).toBe(200);
    // patchStockTransferStatus ran via raw SQL.
    expect(db.$executeRaw).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/transfers/[id]/receive  (gate: construction.transfer.receive + matrix store.transfer:edit)
// ═══════════════════════════════════════════════

describe("POST /api/store/transfers/[id]/receive", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await RECEIVE(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.transfer.receive", async () => {
    setContext(makeUserCtx([]));
    expect((await RECEIVE(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the transfer does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await RECEIVE(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the transfer is in a non-receivable status", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([stRow({ status: "draft" })]);
    const res = await RECEIVE(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/can be received/i);
  });

  it("receives a dispatched transfer and moves any assets", async () => {
    setContext(makeAdminCtx());
    // The repo's mapRow reads the raw `assets` jsonb column into assetLines.
    db.$queryRaw.mockResolvedValue([
      stRow({ status: "dispatched", assets: [{ assetId: "a1" }] }),
    ]);
    db.cnAsset.updateMany.mockResolvedValue({ count: 1 });
    const res = await RECEIVE(req("POST"), params);
    expect(res.status).toBe(200);
    expect(db.cnAsset.updateMany).toHaveBeenCalled();
    expect(db.cnAsset.updateMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});
