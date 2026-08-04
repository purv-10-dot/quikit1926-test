import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, DELETE } from "@/app/api/purchase/rfqs/[id]/route";
import { POST as SUBMIT } from "@/app/api/purchase/rfqs/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/purchase/rfqs/[id]/approve/route";
import { GET as PREVIEW } from "@/app/api/purchase/rfqs/[id]/preview/route";
import { GET as PREVIEW_PDF } from "@/app/api/purchase/rfqs/[id]/preview/pdf/route";
import { POST as QUOTE } from "@/app/api/purchase/rfqs/[id]/vendors/[vendorRowId]/quote/route";

const db = mockDb as any;
const ID = "rfq1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown, path = ""): NextRequest {
  return new NextRequest(`http://localhost/api/purchase/rfqs/${ID}${path}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

/** An RFQ row as cnRfq.findFirst would return it (pre-enrichment). */
function rfqRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    rfqNumber: "RFQ-SITE-26-0001",
    projectId: "proj1",
    status: "draft",
    approvalId: null,
    lines: [],
    vendors: [],
    termsTemplateId: null,
    createdBy: TEST_USER,
    updatedBy: TEST_USER,
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  // loadLookups joins the project for any RFQ row carrying a projectId.
  db.cnProject.findMany.mockResolvedValue([]);
  // resolveUserNames sources from central auth.User.
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/purchase/rfqs/[id]  (gate: construction.rfq.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/rfqs/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rfq.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnRfq.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns 404 when the RFQ is soft-deleted (inactive)", async () => {
    setContext(makeAdminCtx());
    db.cnRfq.findFirst.mockResolvedValue(rfqRow({ status: "inactive" }));
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the RFQ scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnRfq.findFirst.mockResolvedValue(rfqRow());
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
    expect(db.cnRfq.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/purchase/rfqs/[id]  (gate: construction.rfq.delete + matrix purchase.rfq:delete + ownership)
// ═══════════════════════════════════════════════

describe("DELETE /api/purchase/rfqs/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rfq.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("soft-deletes within the org and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnRfq.findFirst.mockResolvedValue(rfqRow());
    db.cnRfq.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.cnRfq.updateMany.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/rfqs/[id]/submit  (gate: construction.rfq.create + matrix purchase.rfq:edit)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/rfqs/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rfq.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the RFQ does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnRfq.findFirst.mockResolvedValue(null);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the RFQ is not in draft", async () => {
    setContext(makeAdminCtx());
    db.cnRfq.findFirst.mockResolvedValue(rfqRow({ status: "pending_approval" }));
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.cnRfq.findFirst.mockResolvedValue(rfqRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active rfq workflow/i);
  });

  it("submits and moves the RFQ into the workflow (pending)", async () => {
    // USER raiser does not outrank the SITE_ADMIN step → it stays live.
    setContext(makeUserCtx(["construction.rfq.create"]));
    db.cnRfq.findFirst.mockResolvedValue(rfqRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "rfqs",
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
    expect(db.cnRfq.update.mock.calls[0][0].data.status).toBe("pending_approval");
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/rfqs/[id]/approve  (gate: construction.rfq.approve + matrix purchase.rfq:edit)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/rfqs/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rfq.approve", async () => {
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

  it("returns 400 when the RFQ has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.cnRfq.findFirst.mockResolvedValue(rfqRow({ approvalId: null }));
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("approves the final step and flips the RFQ to approved", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.cnRfq.findFirst.mockResolvedValue(rfqRow({ approvalId: "inst1" }));
    db.cnApprovalInstance.findFirst.mockResolvedValue({
      id: "inst1",
      orgId: TEST_TENANT,
      workflowId: "wf1",
      status: "pending_approval",
      currentStepOrder: 1,
    });
    db.cnApprovalWorkflowStep.findFirst
      .mockResolvedValueOnce({ stepOrder: 1, approverUserId: null, approverRoleId: "SITE_ADMIN" })
      .mockResolvedValueOnce(null);
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
    expect(body.approval.status).toBe("approved");
    const updates = db.cnRfq.update.mock.calls.map((c: any) => c[0].data.status);
    expect(updates).toContain("approved");
  });
});

// ═══════════════════════════════════════════════
// GET /api/purchase/rfqs/[id]/preview  (JSON, gate: construction.rfq.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/rfqs/[id]/preview", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PREVIEW(req("GET"), params)).status).toBe(401);
  });

  it("returns 404 when the RFQ does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnRfq.findFirst.mockResolvedValue(null);
    expect((await PREVIEW(req("GET"), params)).status).toBe(404);
  });

  it("returns a preview payload for an authorized request", async () => {
    setContext(makeAdminCtx());
    db.cnRfq.findFirst.mockResolvedValue(rfqRow());
    const res = await PREVIEW(req("GET"), params);
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════
// GET /api/purchase/rfqs/[id]/preview/pdf  (binary PDF, gate: construction.rfq.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/rfqs/[id]/preview/pdf", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PREVIEW_PDF(req("GET", undefined, "/preview/pdf?vendorId=v1"), params)).status).toBe(401);
  });

  it("returns 404 when the RFQ has no vendor to preview", async () => {
    // vendorId is optional — when omitted the route derives it from the RFQ's
    // own vendor rows. With no vendors there is nothing to render, which the
    // route reports as 404 (not 400: the request itself is well-formed).
    setContext(makeAdminCtx());
    db.cnRfq.findFirst.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      rfqNumber: "RFQ-SITE-26-0001",
      status: "draft",
      vendors: [],
      lines: [],
    });
    const res = await PREVIEW_PDF(req("GET", undefined, "/preview/pdf"), params);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/no vendor to preview/i);
  });

  it("returns 404 when the RFQ does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnRfq.findFirst.mockResolvedValue(null);
    const res = await PREVIEW_PDF(req("GET", undefined, "/preview/pdf?vendorId=v1"), params);
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/rfqs/[id]/vendors/[vendorRowId]/quote
// (gate: construction.rfq.edit + matrix purchase.quote_analysis:edit)
// ═══════════════════════════════════════════════

const quoteParams = { params: { id: ID, vendorRowId: "rv1" } };
function quoteReq(body?: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/purchase/rfqs/${ID}/vendors/rv1/quote`,
    {
      method: "POST",
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        : {}),
    },
  );
}

describe("POST /api/purchase/rfqs/[id]/vendors/[vendorRowId]/quote", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await QUOTE(quoteReq({ rates: [{ lineId: "l1", rate: "10" }] }), quoteParams)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rfq.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await QUOTE(quoteReq({ rates: [{ lineId: "l1", rate: "10" }] }), quoteParams)).status).toBe(403);
  });

  it("returns 400 when no rates are supplied", async () => {
    setContext(makeAdminCtx());
    const res = await QUOTE(quoteReq({ rates: [] }), quoteParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least one quoted rate/i);
  });

  it("returns 404 when the vendor row is not on the RFQ", async () => {
    setContext(makeAdminCtx());
    db.cnRfqVendor.findFirst.mockResolvedValue(null); // saveVendorQuote guard → null
    const res = await QUOTE(quoteReq({ rates: [{ lineId: "l1", rate: "10" }] }), quoteParams);
    expect(res.status).toBe(404);
  });

  it("saves the quote and returns the updated RFQ", async () => {
    setContext(makeAdminCtx());
    db.cnRfqVendor.findFirst.mockResolvedValue({ id: "rv1" });
    db.cnRfqVendor.update.mockResolvedValue({ id: "rv1" });
    db.cnRfqVendor.findMany.mockResolvedValue([{ quotedRates: [{ lineId: "l1", rate: "10" }] }]);
    db.cnRfq.update.mockResolvedValue({ id: ID });
    db.cnRfq.findFirst.mockResolvedValue(rfqRow({ status: "quoted" })); // findRfqById refetch
    const res = await QUOTE(quoteReq({ rates: [{ lineId: "l1", rate: "10" }] }), quoteParams);
    expect(res.status).toBe(200);
    expect(db.cnRfqVendor.update.mock.calls[0][0].where).toMatchObject({ id: "rv1" });
  });
});
