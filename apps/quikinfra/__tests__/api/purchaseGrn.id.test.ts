import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/purchase/grn/[id]/route";
import { POST as SUBMIT } from "@/app/api/purchase/grn/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/purchase/grn/[id]/approve/route";
import { GET as PREVIEW_PDF } from "@/app/api/purchase/grn/[id]/preview/pdf/route";

const db = mockDb as any;
const ID = "grn1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown, path = ""): NextRequest {
  return new NextRequest(`http://localhost/api/purchase/grn/${ID}${path}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

/** A GRN row as cnGoodsReceiptNote.findFirst would return it (pre-enrichment). */
function grnRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    grnNumber: "GRN-SITE-26-0001",
    projectId: "proj1",
    vendorId: "v1",
    status: "draft",
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
  // findGRNById → loadLineLookups (cnItem/cnUOM) + resolveUserNames (auth.User)
  db.cnItem.findMany.mockResolvedValue([]);
  db.cnUOM.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/purchase/grn/[id]  (gate: construction.grn.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/grn/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.grn.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the GRN scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(grnRow());
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
    expect(db.cnGoodsReceiptNote.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/grn/[id]/submit  (gate: construction.grn.create + matrix purchase.grn:edit)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/grn/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.grn.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the GRN does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(null);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the GRN is not in draft", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(grnRow({ status: "pending_approval" }));
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(grnRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active grn workflow/i);
  });

  it("submits and moves the GRN into the workflow (pending)", async () => {
    // USER raiser does not outrank the SITE_ADMIN step → it stays live.
    setContext(makeUserCtx(["construction.grn.create"]));
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(grnRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "grns",
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
    expect(db.cnGoodsReceiptNote.update.mock.calls[0][0].data.status).toBe("pending_approval");
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/grn/[id]/approve  (gate: construction.grn.approve + matrix purchase.grn:edit)
// NOTE: the idempotency guard consumes the request body, so the route always
// reads `action` as the default "approve" (req.json() after the guard fails).
// ═══════════════════════════════════════════════

describe("POST /api/purchase/grn/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.grn.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(403);
  });

  it("returns 404 when the GRN does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(null);
    const res = await APPROVE(req("POST", {}), params);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("GRN_NOT_FOUND");
  });

  it("returns 400 when the GRN has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(grnRow({ approvalId: null }));
    const res = await APPROVE(req("POST", {}), params);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NO_APPROVAL_INSTANCE");
  });

  it("approves the final step, posts stock, and flips the GRN to approved", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    // approve route loads the GRN directly via cnGoodsReceiptNote.findFirst
    // (no findGRNById enrichment). Empty lines → postGRNInward is a no-op.
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      grnNumber: "GRN-SITE-26-0001",
      projectId: "proj1",
      status: "pending_approval", // grn: pending_approval → approved is a legal transition
      approvalId: "inst1",
      storageLocationId: "loc1",
      lines: [],
    });
    db.cnApprovalInstance.findFirst.mockResolvedValue({
      id: "inst1",
      orgId: TEST_TENANT,
      workflowId: "wf1",
      status: "pending_approval",
      currentStepOrder: 1,
    });
    db.cnApprovalWorkflowStep.findFirst
      .mockResolvedValueOnce({ stepOrder: 1, approverUserId: null, approverRoleId: "SITE_ADMIN" })
      .mockResolvedValueOnce(null); // no next step → final
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnGoodsReceiptNote.update.mockResolvedValue({ status: "approved" });
    db.cnApprovalInstance.findUnique.mockResolvedValue({
      id: "inst1",
      status: "approved",
      currentStepOrder: 1,
    });
    db.cnApprovalWorkflowStep.count.mockResolvedValue(1);

    const res = await APPROVE(req("POST", {}), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("approve");
    expect(body.grn.status).toBe("approved");
    expect(body.approval.status).toBe("approved");
  });
});

// ═══════════════════════════════════════════════
// GET /api/purchase/grn/[id]/preview/pdf  (binary PDF, gate: construction.grn.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/grn/[id]/preview/pdf", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PREVIEW_PDF(req("GET", undefined, "/preview/pdf"), params)).status).toBe(401);
  });

  it("returns 404 when the GRN does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(null);
    const res = await PREVIEW_PDF(req("GET", undefined, "/preview/pdf"), params);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the GRN has no line items to preview", async () => {
    setContext(makeAdminCtx());
    db.cnGoodsReceiptNote.findFirst.mockResolvedValue(grnRow({ lines: [] }));
    const res = await PREVIEW_PDF(req("GET", undefined, "/preview/pdf"), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/no line items/i);
  });
});
