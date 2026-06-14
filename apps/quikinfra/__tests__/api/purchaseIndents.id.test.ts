import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, DELETE } from "@/app/api/purchase/indents/[id]/route";
import { POST as SUBMIT } from "@/app/api/purchase/indents/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/purchase/indents/[id]/approve/route";

const db = mockDb as any;
const ID = "ind1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/purchase/indents/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

/** An indent row as cnPurchaseIndent.findFirst would return it (pre-enrichment). */
function indentRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    indentNumber: "IND-SITE-26-0001",
    projectId: "proj1",
    status: "draft",
    approvalId: null,
    lines: [],
    project: { id: "proj1", name: "Site A", code: "SITE" },
    createdBy: TEST_USER,
    updatedBy: TEST_USER,
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  // Indent read-time enrichment batch-fetches items/uoms/vendors and
  // source-PR info; default to empty so `.map` never hits undefined.
  db.cnItem.findMany.mockResolvedValue([]);
  db.cnUOM.findMany.mockResolvedValue([]);
  db.cnVendor.findMany.mockResolvedValue([]);
  db.cnPurchaseRequisition.findMany.mockResolvedValue([]);
  // Audit-name resolution (resolveUserNames → central auth.user.findMany).
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/purchase/indents/[id]  (gate: construction.indent.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/indents/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.indent.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseIndent.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns 404 for a soft-deleted (inactive) indent", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseIndent.findFirst.mockResolvedValue(indentRow({ status: "inactive" }));
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the indent scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseIndent.findFirst.mockResolvedValue(indentRow());
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
    expect(db.cnPurchaseIndent.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/purchase/indents/[id]  (gate: construction.indent.delete + matrix purchase.indent:delete + ownership)
// ═══════════════════════════════════════════════

describe("DELETE /api/purchase/indents/[id]", () => {
  it("returns 403 when the user lacks construction.indent.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when the indent does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseIndent.findFirst.mockResolvedValue(null);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("soft-deletes (status=inactive) within the org and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseIndent.findFirst.mockResolvedValue(indentRow());
    db.cnPurchaseIndent.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const call = db.cnPurchaseIndent.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: ID, orgId: TEST_TENANT });
    expect(call.data.status).toBe("inactive");
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/indents/[id]/submit  (gate: construction.indent.create + matrix purchase.indent:edit + ownership)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/indents/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.indent.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the indent does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseIndent.findFirst.mockResolvedValue(null);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the indent is not in draft", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseIndent.findFirst.mockResolvedValue(indentRow({ status: "pending_approval" }));
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseIndent.findFirst.mockResolvedValue(indentRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active purchase indents workflow/i);
  });

  it("submits and moves the indent into the workflow (pending)", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseIndent.findFirst.mockResolvedValue(indentRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "purchase_indents",
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
    expect(db.cnPurchaseIndent.update.mock.calls[0][0].data.status).toBe(
      "pending_approval",
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/indents/[id]/approve  (gate: construction.indent.approve + matrix purchase.indent:edit)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/indents/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.indent.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(403);
  });

  it("returns 404 when the indent does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseIndent.findFirst.mockResolvedValue(null);
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(404);
  });

  it("returns 400 (via actOnApproval) when the indent has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseIndent.findFirst.mockResolvedValue(indentRow({ approvalId: null }));
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("returns 400 when reject is missing comments", async () => {
    setContext(makeAdminCtx());
    db.cnPurchaseIndent.findFirst.mockResolvedValue(indentRow({ approvalId: "inst1" }));
    const res = await APPROVE(req("POST", { action: "reject" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/comments are required/i);
  });

  it("approves the final step and flips the indent to approved", async () => {
    // SUPER_ADMIN bypasses canActOnStep in actOnApproval.
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.cnPurchaseIndent.findFirst.mockResolvedValue(indentRow({ approvalId: "inst1" }));
    db.cnApprovalInstance.findFirst.mockResolvedValue({
      id: "inst1",
      orgId: TEST_TENANT,
      workflowId: "wf1",
      status: "pending_approval",
      currentStepOrder: 1,
    });
    db.cnApprovalWorkflowStep.findFirst
      .mockResolvedValueOnce({ stepOrder: 1, approverUserId: null, approverRoleId: "SITE_ADMIN" }) // current
      .mockResolvedValueOnce(null); // no next → final
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnApprovalWorkflowStep.count.mockResolvedValue(1);

    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.approval.status).toBe("approved");
    expect(db.cnPurchaseIndent.update.mock.calls.some((c: any) => c[0].data.status === "approved")).toBe(true);
  });
});
