import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// ── Local control surface for the withOrgAuth-based RAB [id] route ──────
// rab/[id]/route.ts gates via `withOrgAuthForModule("projects")`, which uses
// next-auth's getServerSession + getTenantId + userCan — a different auth path
// than the `getTenantContext` one the harness mocks. We replace the whole
// module with a passthrough wrapper driven by the shared `_state.ctx` (via the
// same makeAdminCtx/makeUserCtx helpers), enforcing the `permission` option so
// 401/403 still behave. This stays self-contained to this test file.
const ridState: { ctx: any } = { ctx: null };
function setRidCtx(ctx: any) {
  ridState.ctx = ctx;
}
const has = (ctx: any, resource: string, action: string) =>
  ctx.permissions.has("*") || ctx.permissions.has(`${resource}.${action}`);

vi.mock("@/lib/api/withOrgAuth", () => {
  const wrap =
    (handler: any, options: any = {}) =>
    async (req: any, routeCtx: any) => {
      const ctx = ridState.ctx;
      if (!ctx) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      if (
        options.permission &&
        !has(ctx, options.permission.resource, options.permission.action)
      ) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
      return handler({ session: {}, userId: ctx.userId, orgId: ctx.orgId }, req, routeCtx);
    };
  return {
    withOrgAuth: wrap,
    withOrgAuthForModule: () => wrap,
    withOrgAuthForResource: () => ({
      view: wrap,
      create: wrap,
      edit: wrap,
      delete: wrap,
      approve: wrap,
    }),
    forbidden: () =>
      NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

// The approve route reads req.json() and then idempotencyGuard reads
// req.text() on the SAME NextRequest — Next.js re-reads the body at runtime,
// but the test's NextRequest body stream is single-use. Replace the guard
// with a no-op passthrough (no caching/conflict) so the route runs normally.
vi.mock("@/lib/workflow/idempotency", () => ({
  idempotencyGuard: async () => ({
    cached: false,
    conflict: false,
    commit: async () => {},
    key: "test-key",
    parsedBody: undefined,
  }),
  newIdempotencyKey: () => "test-key",
}));

const { GET, DELETE } = await import("@/app/api/projects/rab/[id]/route");
const { POST: SUBMIT } = await import("@/app/api/projects/rab/[id]/submit/route");
const { POST: APPROVE } = await import("@/app/api/projects/rab/[id]/approve/route");
const { GET: PREVIEW_PDF } = await import("@/app/api/projects/rab/[id]/preview/pdf/route");

const db = mockDb as any;
const ID = "r1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/rab/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

function rabRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    rabNumber: "RAB-2026-00001",
    projectId: "proj1",
    contractorId: "c1",
    woId: "wo1",
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
  setContext(null); // for the requireProjectsFinanceAction routes
  setRidCtx(null); // for the withOrgAuth route
  db.cnBOQItemV2.findMany.mockResolvedValue([]);
  db.cnUOM.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/projects/rab/[id]  (withOrgAuth, construction.rab.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/rab/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rab.view", async () => {
    setRidCtx(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when not found in this org", async () => {
    setRidCtx(makeAdminCtx());
    db.cnRunningAccountBill.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the RAB scoped to the org", async () => {
    setRidCtx(makeAdminCtx());
    db.cnRunningAccountBill.findFirst.mockResolvedValue(rabRow());
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(ID);
    expect(db.cnRunningAccountBill.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/projects/rab/[id]  (withOrgAuth, construction.rab.delete)
// ═══════════════════════════════════════════════

describe("DELETE /api/projects/rab/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rab.delete", async () => {
    setRidCtx(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when the row does not exist", async () => {
    setRidCtx(makeAdminCtx());
    db.cnRunningAccountBill.findFirst.mockResolvedValue(null);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("returns 400 when the RAB is approved/paid", async () => {
    setRidCtx(makeAdminCtx());
    db.cnRunningAccountBill.findFirst.mockResolvedValue({ id: ID, status: "approved" });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/approved\/paid/i);
  });

  it("hard-deletes a draft RAB and returns success", async () => {
    setRidCtx(makeAdminCtx());
    db.cnRunningAccountBill.findFirst.mockResolvedValue({ id: ID, status: "draft" });
    db.cnRunningAccountBill.delete.mockResolvedValue({ id: ID });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.cnRunningAccountBill.delete.mock.calls[0][0].where.id).toBe(ID);
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/rab/[id]/submit  (gate construction.rab.create + matrix pm.dpr:edit)
// ═══════════════════════════════════════════════

describe("POST /api/projects/rab/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rab.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the RAB does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnRunningAccountBill.findFirst.mockResolvedValue(null);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 on an illegal transition (already approved)", async () => {
    setContext(makeAdminCtx());
    db.cnRunningAccountBill.findFirst.mockResolvedValue(rabRow({ status: "approved" }));
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_TRANSITION");
  });

  it("returns 400 when no active RAB workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.cnRunningAccountBill.findFirst.mockResolvedValue(rabRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active rab workflow/i);
  });

  it("submits and moves the RAB into the workflow (pending)", async () => {
    setContext(makeUserCtx(["construction.rab.create"]));
    db.cnRunningAccountBill.findFirst.mockResolvedValue(rabRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "rab",
      isActive: true,
      projectId: "proj1",
      steps: [
        { stepOrder: 1, approverUserId: null, approverUserIds: null, approverRoleId: "SITE_ADMIN" },
      ],
    });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnApprovalInstance.create.mockResolvedValue({ id: "inst1" });
    db.cnRunningAccountBill.update.mockResolvedValue({
      id: ID,
      rabNumber: "RAB-2026-00001",
      status: "submitted",
    });

    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approvalInstanceId).toBe("inst1");
    expect(body.autoApproved).toBe(false);
    expect(db.cnRunningAccountBill.update.mock.calls[0][0].data.status).toBe(
      "submitted",
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/rab/[id]/approve  (gate construction.rab.approve + matrix pm.dpr:edit)
// ═══════════════════════════════════════════════

describe("POST /api/projects/rab/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rab.approve", async () => {
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

  it("returns 404 when the RAB does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnRunningAccountBill.findFirst.mockResolvedValue(null);
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(404);
  });

  it("returns 400 when the RAB has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.cnRunningAccountBill.findFirst.mockResolvedValue(rabRow({ approvalId: null }));
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("approves the final step and flips the RAB to approved", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.cnRunningAccountBill.findFirst.mockResolvedValue(
      rabRow({ approvalId: "inst1", lines: [] }),
    );
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
    db.cnRunningAccountBill.update.mockResolvedValue({ id: ID, status: "approved" });
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
    expect(body.rab.status).toBe("approved");
    expect(body.approval.status).toBe("approved");
  });
});

// ═══════════════════════════════════════════════
// GET /api/projects/rab/[id]/preview/pdf  (binary PDF, gate construction.rab.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/rab/[id]/preview/pdf", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PREVIEW_PDF(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rab.view", async () => {
    setContext(makeUserCtx([]));
    expect((await PREVIEW_PDF(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when the RAB does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnRunningAccountBill.findFirst.mockResolvedValue(null);
    expect((await PREVIEW_PDF(req("GET"), params)).status).toBe(404);
  });

  it("streams application/pdf for an authorized request", async () => {
    setContext(makeAdminCtx());
    db.cnRunningAccountBill.findFirst.mockResolvedValue({
      ...rabRow(),
      lines: [],
      project: { id: "proj1", name: "Bridge" },
      workOrder: { id: "wo1", woNumber: "WO-001" },
      contractor: { id: "c1", name: "Acme" },
      createdAt: new Date("2026-06-30"),
      billPeriodFrom: new Date("2026-06-01"),
      billPeriodTo: new Date("2026-06-30"),
    });
    db.cnTermsCondition.findFirst.mockResolvedValue(null);
    const res = await PREVIEW_PDF(req("GET"), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/pdf/i);
  });
});
