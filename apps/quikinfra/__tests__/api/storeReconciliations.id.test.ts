import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/store/reconciliations/[id]/route";
import { POST as SUBMIT } from "@/app/api/store/reconciliations/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/store/reconciliations/[id]/approve/route";
import { POST as LEGACY_APPROVE } from "@/app/api/store/reconciliation/[id]/approve/route";

const db = mockDb as any;
const ID = "r1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/store/reconciliations/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

function reconRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    reconciliationNumber: "REC-001",
    projectId: "proj1",
    locationId: "loc1",
    reconciliationDate: new Date("2026-01-15"),
    conductedById: TEST_USER,
    approvedById: null,
    approvalId: null,
    status: "draft",
    lines: [],
    createdBy: TEST_USER,
    updatedBy: TEST_USER,
    createdAt: new Date(),
    updatedAt: new Date(),
    project: { id: "proj1", name: "Acme Tower", code: "AT" },
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnItem.findMany.mockResolvedValue([]);
  db.cnUOM.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/store/reconciliations/[id]
// ═══════════════════════════════════════════════

describe("GET /api/store/reconciliations/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.reconciliation.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the reconciliation scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue(reconRow());
    db.cnLocation.findFirst.mockResolvedValue({ id: "loc1", name: "Main Store" });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(ID);
    expect(db.cnStockReconciliation.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/reconciliations/[id]/submit
// ═══════════════════════════════════════════════

describe("POST /api/store/reconciliations/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.reconciliation.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the reconciliation does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue(null);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the reconciliation is not in draft", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue(reconRow({ status: "approved" }));
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue(reconRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active reconciliation workflow/i);
  });

  it("submits and moves the reconciliation into the workflow (pending)", async () => {
    setContext(makeUserCtx(["construction.reconciliation.create"]));
    db.cnStockReconciliation.findFirst.mockResolvedValue(reconRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "stock_reconciliation",
      isActive: true,
      projectId: "proj1",
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
// POST /api/store/reconciliations/[id]/approve  (actOnApproval)
// ═══════════════════════════════════════════════

describe("POST /api/store/reconciliations/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.reconciliation.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(403);
  });

  it("returns 404 when the reconciliation does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue(null);
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(404);
  });

  it("returns 400 when the reconciliation has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue(reconRow({ approvalId: null }));
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("approves the final step and flips the reconciliation to approved", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.cnStockReconciliation.findFirst.mockResolvedValue(reconRow({ approvalId: "inst1" }));
    db.cnApprovalInstance.findFirst.mockResolvedValue({
      id: "inst1",
      orgId: TEST_TENANT,
      workflowId: "wf1",
      status: "pending_approval",
      currentStepOrder: 1,
    });
    db.cnApprovalWorkflowStep.findFirst
      .mockResolvedValueOnce({ stepOrder: 1, approverUserId: null, approverRoleId: "SITE_ADMIN" }) // current
      .mockResolvedValueOnce(null); // next → final
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
// POST /api/store/reconciliation/[id]/approve  (legacy handleApprovalAction)
// ═══════════════════════════════════════════════

describe("POST /api/store/reconciliation/[id]/approve (legacy)", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await LEGACY_APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.reconciliation.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await LEGACY_APPROVE(req("POST", { action: "approve" }), params)).status).toBe(403);
  });

  it("returns 400 on an unknown action", async () => {
    setContext(makeAdminCtx());
    const res = await LEGACY_APPROVE(req("POST", { action: "frobnicate" }), params);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the reconciliation does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue(null);
    expect((await LEGACY_APPROVE(req("POST", { action: "approve" }), params)).status).toBe(404);
  });

  it("approves a draft reconciliation and flips status to approved", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findFirst.mockResolvedValue(reconRow({ status: "draft" }));
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnStockReconciliation.update.mockResolvedValue(
      reconRow({ status: "approved", approvedById: TEST_USER }),
    );
    const res = await LEGACY_APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
