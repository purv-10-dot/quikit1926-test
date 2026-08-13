import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, PATCH, DELETE } from "@/app/api/purchase/requisitions/[id]/route";
import { POST as SUBMIT } from "@/app/api/purchase/requisitions/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/purchase/requisitions/[id]/approve/route";
import { GET as BUDGET } from "@/app/api/purchase/requisitions/estimation-budget/route";

const db = mockDb as any;
const ID = "pr1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown, qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/purchase/requisitions/${ID}${qs ? "?" + qs : ""}`,
    {
      method,
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        : {}),
    },
  );
}

/** A PR row as cnPurchaseRequisition.findFirst would return it (pre-enrichment). */
function prRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    prNumber: "PR-SITE-26-0001",
    projectId: "proj1",
    status: "draft",
    stockCheckSummary: "PROCUREMENT_NEEDED",
    approvalId: null,
    lines: [],
    createdBy: TEST_USER,
    updatedBy: TEST_USER,
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  // PR read-time enrichment batch-fetches masters — default to empty.
  db.cnProject.findMany.mockResolvedValue([]);
  db.cnItem.findMany.mockResolvedValue([]);
  db.cnUOM.findMany.mockResolvedValue([]);
  db.cnWorkCategory.findMany.mockResolvedValue([]);
  db.cnLocation.findMany.mockResolvedValue([]);
  // Audit-name resolution (resolveUserNames → central auth.user.findMany).
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/purchase/requisitions/[id]  (gate: construction.pr.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/requisitions/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.pr.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseRequisition.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the PR scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseRequisition.findFirst.mockResolvedValue(prRow());
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
    expect(db.cnPurchaseRequisition.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// PATCH /api/purchase/requisitions/[id]  (gate: construction.pr.edit + matrix purchase.mr:edit + ownership)
// ═══════════════════════════════════════════════

describe("PATCH /api/purchase/requisitions/[id]", () => {
  it("returns 403 when the user lacks construction.pr.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await PATCH(req("PATCH", { purpose: "x" }), params)).status).toBe(403);
  });

  it("returns 404 when updating a missing row", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseRequisition.findFirst.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { purpose: "x" }), params)).status).toBe(404);
  });

  it("updates and stamps updatedBy", async () => {
    setContext(makeAdminCtx());
    // first findFirst = existing (ownership/exists check), second = findPRById refetch
    db.cnPurchaseRequisition.findFirst.mockResolvedValue(prRow());
    db.cnPurchaseRequisition.update.mockResolvedValue(prRow({ purpose: "Renamed" }));
    const res = await PATCH(req("PATCH", { purpose: "Renamed" }), params);
    expect(res.status).toBe(200);
    expect(db.cnPurchaseRequisition.update.mock.calls[0][0].data.updatedBy).toBe(TEST_USER);
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/purchase/requisitions/[id]  (gate: construction.pr.delete + matrix purchase.mr:delete + ownership)
// ═══════════════════════════════════════════════

describe("DELETE /api/purchase/requisitions/[id]", () => {
  it("returns 403 when the user lacks construction.pr.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("deletes within the org and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseRequisition.findFirst.mockResolvedValue(prRow());
    db.cnPurchaseRequisition.deleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.cnPurchaseRequisition.deleteMany.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/requisitions/[id]/submit  (gate: construction.pr.create + matrix purchase.mr:edit)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/requisitions/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.pr.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the PR does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseRequisition.findFirst.mockResolvedValue(null);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the PR is not in draft", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseRequisition.findFirst.mockResolvedValue(prRow({ status: "pending_approval" }));
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseRequisition.findFirst.mockResolvedValue(prRow());
    // submitForApproval resolves the workflow; none active → NoActiveWorkflowError → 400
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active purchase requisition workflow/i);
  });

  it("submits and moves the PR into the workflow (pending)", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseRequisition.findFirst.mockResolvedValue(prRow());
    // active workflow with one role step the admin (roleKey 'admin') doesn't fill → live step
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "purchase_requisitions",
      isActive: true,
      projectId: "proj1",
      // Pinned to a DIFFERENT user so the raiser isn't in the pool and the
      // step stays live (no auto-approve on submit).
      steps: [{ stepOrder: 1, approverUserId: "other-user", approverUserIds: null, approverRoleId: null }],
    });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnApprovalInstance.create.mockResolvedValue({ id: "inst1" });

    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approvalInstanceId).toBe("inst1");
    expect(body.autoApproved).toBe(false);
    // PR row patched inside the txn → status pending_approval
    expect(db.cnPurchaseRequisition.update.mock.calls[0][0].data.status).toBe(
      "pending_approval",
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/requisitions/[id]/approve  (gate: construction.pr.approve + matrix purchase.mr:edit)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/requisitions/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.pr.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(403);
  });

  it("returns 400 on an unknown action", async () => {
    setContext(makeAdminCtx());
    const res = await APPROVE(req("POST", { action: "frobnicate" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown action/i);
  });

  it("returns 400 when reject is missing comments", async () => {
    setContext(makeAdminCtx());
    const res = await APPROVE(req("POST", { action: "reject" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/comments are required/i);
  });

  it("returns 400 when the PR has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseRequisition.findFirst.mockResolvedValue(prRow({ approvalId: null }));
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("approves the final step and flips the PR to approved", async () => {
    // SUPER_ADMIN passes canActOnStep regardless of the pinned approver.
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.cnPurchaseRequisition.findFirst.mockResolvedValue(
      prRow({ approvalId: "inst1", stockCheckSummary: "PROCUREMENT_NEEDED" }),
    );
    db.cnApprovalInstance.findFirst.mockResolvedValue({
      id: "inst1",
      orgId: TEST_TENANT,
      workflowId: "wf1",
      status: "pending_approval",
      currentStepOrder: 1,
    });
    db.cnApprovalWorkflowStep.findMany.mockResolvedValue([
      { stepOrder: 1, approverUserId: null, approverUserIds: [], approverRoleId: "SITE_ADMIN" },
    ] as never); // single step → final
    db.cnApprovalInstance.updateMany.mockResolvedValue({ count: 1 } as never);
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnApprovalInstance.findUnique.mockResolvedValue({
      id: "inst1",
      status: "approved",
      currentStepOrder: 1,
    });
    db.cnApprovalWorkflowStep.count.mockResolvedValue(1);

    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("approve");
    expect(body.approval.status).toBe("approved");
    // final-approve branch flips the PR
    const updates = db.cnPurchaseRequisition.update.mock.calls.map((c: any) => c[0].data.status);
    expect(updates).toContain("approved_indent_required");
  });
});

// ═══════════════════════════════════════════════
// GET /api/purchase/requisitions/estimation-budget  (gate: construction.pr.view)
// ═══════════════════════════════════════════════

function budgetReq(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/purchase/requisitions/estimation-budget${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}

describe("GET /api/purchase/requisitions/estimation-budget", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await BUDGET(budgetReq("projectId=proj1"))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.pr.view", async () => {
    setContext(makeUserCtx([]));
    expect((await BUDGET(budgetReq("projectId=proj1"))).status).toBe(403);
  });

  it("returns 400 when projectId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await BUDGET(budgetReq());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/projectid is required/i);
  });

  it("returns the per-material budget for a project", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]); // no approved estimations → empty budget
    const res = await BUDGET(budgetReq("projectId=proj1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
  });
});
