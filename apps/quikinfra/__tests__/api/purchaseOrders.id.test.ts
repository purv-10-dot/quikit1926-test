import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, DELETE } from "@/app/api/purchase/orders/[id]/route";
import { POST as SUBMIT } from "@/app/api/purchase/orders/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/purchase/orders/[id]/approve/route";
import { POST as CLOSE } from "@/app/api/purchase/orders/[id]/close/route";
import { GET as PREVIEW } from "@/app/api/purchase/orders/[id]/preview/route";
import { GET as PREVIEW_PDF } from "@/app/api/purchase/orders/[id]/preview/pdf/route";

const db = mockDb as any;
const ID = "po1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/purchase/orders/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

/** A PO row as cnPurchaseOrder.findFirst would return it (pre-enrichment). */
function poRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    poNumber: "PO-SITE-26-0001",
    projectId: "proj1",
    vendorId: "v1",
    status: "draft",
    approvalId: null,
    lines: [],
    freightCharges: "0",
    closedAt: null,
    createdBy: TEST_USER,
    updatedBy: TEST_USER,
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/purchase/orders/[id]  (gate: construction.po.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/orders/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.po.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the PO scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(poRow());
    db.user.findMany.mockResolvedValue([]); // resolveUserNames (central auth.User)
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
    expect(db.cnPurchaseOrder.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/purchase/orders/[id]  (gate: construction.po.delete + matrix purchase.po:delete + ownership)
// ═══════════════════════════════════════════════

describe("DELETE /api/purchase/orders/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.po.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when deleting a missing row", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(null);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("soft-deletes within the org and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(poRow());
    db.cnPurchaseOrder.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.cnPurchaseOrder.updateMany.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/orders/[id]/submit  (gate: construction.po.create + matrix purchase.po:edit)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/orders/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.po.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the PO does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(null);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the PO is not in draft", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(poRow({ status: "pending_approval" }));
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(poRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active po workflow/i);
  });

  it("submits and moves the PO into the workflow (pending)", async () => {
    // A USER-role raiser does NOT outrank the SITE_ADMIN step → it stays live
    // (not auto-skipped), so the PO lands in pending_approval.
    setContext(makeUserCtx(["construction.po.create"]));
    db.cnPurchaseOrder.findFirst.mockResolvedValue(poRow());
    db.user.findMany.mockResolvedValue([]);
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "purchase_orders",
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
    expect(db.cnPurchaseOrder.update.mock.calls[0][0].data.status).toBe("pending_approval");
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/orders/[id]/approve  (gate: construction.po.approve + matrix purchase.po:edit)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/orders/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.po.approve", async () => {
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

  it("returns 400 when the PO has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(poRow({ approvalId: null }));
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("approves the final step and flips the PO to approved", async () => {
    // super_admin passes canActOnStep regardless of the pinned approver
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.cnPurchaseOrder.findFirst.mockResolvedValue(poRow({ approvalId: "inst1" }));
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
    const updates = db.cnPurchaseOrder.update.mock.calls.map((c: any) => c[0].data.status);
    expect(updates).toContain("approved");
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/orders/[id]/close  (gate: construction.po.edit + matrix purchase.po:edit)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/orders/[id]/close", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await CLOSE(req("POST", { reason: "late" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.po.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await CLOSE(req("POST", { reason: "late" }), params)).status).toBe(403);
  });

  it("returns 400 when the close reason is missing", async () => {
    setContext(makeAdminCtx());
    const res = await CLOSE(req("POST", {}), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/reason is required/i);
  });

  it("returns 404 when the PO does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(null);
    const res = await CLOSE(req("POST", { reason: "late" }), params);
    expect(res.status).toBe(404);
  });

  it("returns 409 when the PO is already closed", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue({
      id: ID,
      status: "closed",
      poNumber: "PO-SITE-26-0001",
    });
    const res = await CLOSE(req("POST", { reason: "late" }), params);
    expect(res.status).toBe(409);
  });

  it("closes the PO and stamps status=closed", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst
      .mockResolvedValueOnce({ id: ID, status: "approved", poNumber: "PO-SITE-26-0001" }) // close lookup
      .mockResolvedValueOnce(poRow({ status: "approved" })); // findPOById for the email
    db.$executeRawUnsafe.mockResolvedValue(1);
    const res = await CLOSE(req("POST", { reason: "Vendor never delivered" }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("closed");
    expect(db.$executeRawUnsafe).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════
// GET /api/purchase/orders/[id]/preview  (JSON email preview, gate: construction.po.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/orders/[id]/preview", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PREVIEW(req("GET"), params)).status).toBe(401);
  });

  it("returns 404 when the PO does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(null);
    expect((await PREVIEW(req("GET"), params)).status).toBe(404);
  });

  it("returns a preview payload for an authorized request", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(poRow({ vendorId: "v1" }));
    const res = await PREVIEW(req("GET"), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/json/i);
  });
});

// ═══════════════════════════════════════════════
// GET /api/purchase/orders/[id]/preview/pdf  (binary PDF, gate: construction.po.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/orders/[id]/preview/pdf", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PREVIEW_PDF(req("GET"), params)).status).toBe(401);
  });

  it("returns 404 when the PO does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseOrder.findFirst.mockResolvedValue(null);
    expect((await PREVIEW_PDF(req("GET"), params)).status).toBe(404);
  });
});
