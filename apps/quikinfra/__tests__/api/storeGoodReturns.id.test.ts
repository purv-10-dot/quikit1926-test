import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, DELETE, PATCH } from "@/app/api/store/good-returns/[id]/route";
import { POST as SUBMIT } from "@/app/api/store/good-returns/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/store/good-returns/[id]/approve/route";
import { POST as DISPATCH } from "@/app/api/store/good-returns/[id]/dispatch/route";

const db = mockDb as any;
const ID = "gr1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/store/good-returns/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

function rawRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    returnNumber: "GR-20260115-0001",
    projectId: "proj1",
    projectName: "Acme Tower",
    vendorId: "v1",
    vendorName: "Bolt Supplies",
    status: "draft",
    approvalId: null,
    materials: [],
    lineCount: 0,
    createdBy: TEST_USER,
    updatedBy: TEST_USER,
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/store/good-returns/[id]
// ═══════════════════════════════════════════════

describe("GET /api/store/good-returns/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.return.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the good return scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow()]);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/store/good-returns/[id]
// ═══════════════════════════════════════════════

describe("DELETE /api/store/good-returns/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.return.delete", async () => {
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
    db.$queryRaw.mockResolvedValue([rawRow()]);
    db.$executeRaw.mockResolvedValue(1);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// PATCH /api/store/good-returns/[id]
// ═══════════════════════════════════════════════

describe("PATCH /api/store/good-returns/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PATCH(req("PATCH", { remarks: "x" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.return.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await PATCH(req("PATCH", { remarks: "x" }), params)).status).toBe(403);
  });

  it("returns 404 when updating a missing row", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await PATCH(req("PATCH", { remarks: "x" }), params)).status).toBe(404);
  });

  it("updates editable fields and returns the row", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow()]);
    db.$executeRaw.mockResolvedValue(1);
    const res = await PATCH(req("PATCH", { remarks: "updated" }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/good-returns/[id]/submit
// ═══════════════════════════════════════════════

describe("POST /api/store/good-returns/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.return.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the good return does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the good return is not in draft", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow({ status: "approved" })]);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow()]);
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active good return workflow/i);
  });

  it("submits and moves the good return into the workflow (pending)", async () => {
    setContext(makeUserCtx(["construction.return.create"]));
    db.$queryRaw.mockResolvedValue([rawRow()]);
    db.$executeRaw.mockResolvedValue(1);
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "good_return",
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
// POST /api/store/good-returns/[id]/approve  (inline workflow walk)
// ═══════════════════════════════════════════════

describe("POST /api/store/good-returns/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.return.approve", async () => {
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

  it("returns 404 when the good return does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(404);
  });

  it("returns 400 when the good return has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow({ approvalId: null })]);
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("approves the final step and flips the good return to approved", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.$queryRaw.mockResolvedValue([rawRow({ approvalId: "inst1" })]);
    db.$executeRaw.mockResolvedValue(1);
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
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/good-returns/[id]/dispatch
// ═══════════════════════════════════════════════

describe("POST /api/store/good-returns/[id]/dispatch", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DISPATCH(req("POST", {}), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.return.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await DISPATCH(req("POST", {}), params)).status).toBe(403);
  });

  it("returns 404 when the good return does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await DISPATCH(req("POST", {}), params)).status).toBe(404);
  });

  it("returns 400 when dispatching from a non-approved status", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow({ status: "draft" })]);
    const res = await DISPATCH(req("POST", {}), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot dispatch/i);
  });

  it("dispatches an approved good return and stamps status=dispatched", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw
      .mockResolvedValueOnce([rawRow({ status: "approved" })]) // route find
      .mockResolvedValueOnce([rawRow({ status: "approved" })]) // patch existing lookup
      .mockResolvedValueOnce([rawRow({ status: "dispatched" })]); // patch final lookup
    db.$executeRaw.mockResolvedValue(1);
    const res = await DISPATCH(req("POST", { vehicleNo: "KA01AB1234" }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("dispatched");
  });
});
