import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/projects/work-orders/[id]/route";
import { POST as SUBMIT } from "@/app/api/projects/work-orders/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/projects/work-orders/[id]/approve/route";
import { GET as PREVIEW_PDF } from "@/app/api/projects/work-orders/[id]/preview/pdf/route";

const db = mockDb as any;
const ID = "wo1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/work-orders/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

function woRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    woNumber: "WO-STE-460",
    orgId: TEST_TENANT,
    projectId: "proj1",
    contractorId: "c1",
    status: "draft",
    approvalId: null,
    totalAmount: "0",
    lines: [],
    project: { id: "proj1", name: "Site", code: "STE" },
    contractor: { id: "c1", name: "Acme" },
    createdBy: TEST_USER,
    updatedBy: TEST_USER,
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.user.findMany.mockResolvedValue([]);
  db.cnUOM.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/projects/work-orders/[id]  (gate: construction.wo.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/work-orders/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.wo.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the WO scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue(woRow());
    // The detail handler rolls up approved-DPR quantities to derive progressPct.
    db.cnDPRWorkItem.findMany.mockResolvedValue([]);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
    expect(db.cnWorkOrder.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// PUT /api/projects/work-orders/[id]  (gate: construction.wo.edit + matrix pm.work_order:edit)
// ═══════════════════════════════════════════════

describe("PUT /api/projects/work-orders/[id]", () => {
  it("returns 403 when the user lacks construction.wo.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await PUT(req("PUT", { title: "X" }), params)).status).toBe(403);
  });

  it("returns 404 when updating a missing WO", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue(null);
    expect((await PUT(req("PUT", { title: "X" }), params)).status).toBe(404);
  });

  it("updates and stamps updatedBy", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst
      .mockResolvedValueOnce({ id: ID, createdBy: TEST_USER }) // existing
      .mockResolvedValueOnce(woRow({ title: "Renamed" })); // refreshed
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnWorkOrder.update.mockResolvedValue({});
    const res = await PUT(req("PUT", { title: "Renamed" }), params);
    expect(res.status).toBe(200);
    expect(db.cnWorkOrder.update.mock.calls[0][0].data.updatedBy).toBe(TEST_USER);
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/projects/work-orders/[id]  (gate: construction.wo.delete + matrix pm.work_order:delete)
// ═══════════════════════════════════════════════

describe("DELETE /api/projects/work-orders/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.wo.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when deleting a missing WO", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue(null);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("soft-deletes within the org and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue({ id: ID, createdBy: TEST_USER });
    db.cnWorkOrder.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.cnWorkOrder.updateMany.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/work-orders/[id]/submit  (gate: construction.wo.create + matrix pm.work_order:edit)
// ═══════════════════════════════════════════════

describe("POST /api/projects/work-orders/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.wo.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the WO does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue(null);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the WO is not in draft", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue({
      id: ID,
      status: "pending_approval",
      woNumber: "WO-STE-460",
      projectId: "proj1",
      createdBy: TEST_USER,
    });
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue({
      id: ID,
      status: "draft",
      woNumber: "WO-STE-460",
      projectId: "proj1",
      createdBy: TEST_USER,
    });
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active work order workflow/i);
  });

  it("submits and moves the WO into the workflow (pending)", async () => {
    setContext(makeUserCtx(["construction.wo.create"]));
    db.cnWorkOrder.findFirst.mockResolvedValue({
      id: ID,
      status: "draft",
      woNumber: "WO-STE-460",
      projectId: "proj1",
      createdBy: TEST_USER,
    });
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "work_order",
      isActive: true,
      projectId: "proj1",
      steps: [
        { stepOrder: 1, approverUserId: null, approverUserIds: null, approverRoleId: "SITE_ADMIN" },
      ],
    });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnApprovalInstance.create.mockResolvedValue({ id: "inst1" });
    db.cnWorkOrder.update.mockResolvedValue({ id: ID, status: "pending_approval" });

    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approvalInstanceId).toBe("inst1");
    expect(body.autoApproved).toBe(false);
    expect(db.cnWorkOrder.update.mock.calls[0][0].data.status).toBe("pending_approval");
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/work-orders/[id]/approve  (gate: construction.wo.approve + matrix pm.work_order:edit)
// ═══════════════════════════════════════════════

describe("POST /api/projects/work-orders/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.wo.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(403);
  });

  it("returns 400 on an unknown action", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue(woRow({ approvalId: "inst1" }));
    const res = await APPROVE(req("POST", { action: "frobnicate" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown action/i);
  });

  it("returns 400 when the WO has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue(woRow({ approvalId: null }));
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("approves the final step and flips the WO to approved", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.cnWorkOrder.findFirst
      .mockResolvedValueOnce(woRow({ approvalId: "inst1", status: "pending_approval" })) // lookup
      .mockResolvedValueOnce(woRow({ approvalId: "inst1", status: "approved" })); // refreshed
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
    db.cnApprovalWorkflowStep.count.mockResolvedValue(1);

    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("approve");
    const updates = db.cnWorkOrder.update.mock.calls.map((c: any) => c[0].data.status);
    expect(updates).toContain("approved");
  });
});

// ═══════════════════════════════════════════════
// GET /api/projects/work-orders/[id]/preview/pdf  (gate: construction.wo.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/work-orders/[id]/preview/pdf", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PREVIEW_PDF(req("GET"), params)).status).toBe(401);
  });

  it("returns 404 when the WO does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue(null);
    expect((await PREVIEW_PDF(req("GET"), params)).status).toBe(404);
  });

  it("returns 404 when the WO has no scope items", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue(woRow({ lines: [] }));
    expect((await PREVIEW_PDF(req("GET"), params)).status).toBe(404);
  });

  it("streams a PDF (non-JSON) for an authorized WO with scope", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findFirst.mockResolvedValue(
      woRow({
        lines: [
          { id: "l1", boqItemId: "B1", description: "Excavation", uomId: "u1", quantity: "10", negotiatedRate: "5", amount: "50" },
        ],
        totalAmount: "50",
      }),
    );
    db.cnUOM.findMany.mockResolvedValue([{ id: "u1", code: "CUM" }]);
    const res = await PREVIEW_PDF(req("GET"), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/pdf/i);
  });
});
