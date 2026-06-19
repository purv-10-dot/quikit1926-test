import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/estimations/[id]/route";
import { POST as SUBMIT } from "@/app/api/estimations/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/estimations/[id]/approve/route";

const db = mockDb as any;
const ID = "est1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/estimations/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

/** What findEstimationById (raw SQL → mapRow) returns. */
function estRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    projectId: "proj1",
    projectName: "Site",
    boqItemId: "B1",
    boqNo: "1.1",
    status: "draft",
    approvalId: null,
    materials: [],
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
// GET /api/estimations/[id]
// ═══════════════════════════════════════════════

describe("GET /api/estimations/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]); // findEstimationById → null
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the row scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([estRow()]);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
  });
});

// ═══════════════════════════════════════════════
// PUT /api/estimations/[id]  (matrix gate: pm.estimation:edit + ownership)
// ═══════════════════════════════════════════════

describe("PUT /api/estimations/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PUT(req("PUT", { phase: "X" }), params)).status).toBe(401);
  });

  it("returns 403 when the matrix denies edit", async () => {
    setContext(makeUserCtx([], { permissionMatrix: { "pm.estimation": { edit: false } } }));
    expect((await PUT(req("PUT", { phase: "X" }), params)).status).toBe(403);
  });

  it("returns 404 when updating a missing row", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]); // findEstimationById → null
    expect((await PUT(req("PUT", { phase: "X" }), params)).status).toBe(404);
  });

  it("updates and returns the row", async () => {
    setContext(makeAdminCtx());
    // 1) findEstimationById (existing) 2) updateEstimation→findEstimationById (existing)
    // 3) updateEstimation→findEstimationById (after update)
    db.$queryRaw.mockResolvedValue([estRow({ phase: "Structure" })]);
    const res = await PUT(req("PUT", { phase: "Structure" }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).phase).toBe("Structure");
    expect(db.$executeRaw).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/estimations/[id]  (matrix gate: pm.estimation:delete + ownership)
// ═══════════════════════════════════════════════

describe("DELETE /api/estimations/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the matrix denies delete", async () => {
    setContext(makeUserCtx([], { permissionMatrix: { "pm.estimation": { delete: false } } }));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when deleting a missing row", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("hard-deletes and returns success", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([estRow()]);
    db.$executeRaw.mockResolvedValue(1); // deleteEstimation → 1 affected
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// POST /api/estimations/[id]/submit  (matrix gate: pm.estimation:edit)
// ═══════════════════════════════════════════════

describe("POST /api/estimations/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the matrix denies edit", async () => {
    setContext(makeUserCtx([], { permissionMatrix: { "pm.estimation": { edit: false } } }));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the estimation does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the estimation is not in draft", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([estRow({ status: "pending_approval" })]);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([estRow()]);
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active material estimation workflow/i);
  });

  it("submits and moves the estimation into the workflow (pending)", async () => {
    setContext(makeUserCtx([], { roleKey: "user" }));
    db.$queryRaw.mockResolvedValue([estRow()]);
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "material_estimations",
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
// POST /api/estimations/[id]/approve  (requireAuth + matrix gate: pm.estimation:edit)
// ═══════════════════════════════════════════════

describe("POST /api/estimations/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the matrix denies edit", async () => {
    setContext(makeUserCtx([], { permissionMatrix: { "pm.estimation": { edit: false } } }));
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(403);
  });

  it("returns 404 when the estimation does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(404);
  });

  it("returns 400 when the estimation has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([estRow({ approvalId: null })]);
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("returns 400 on an unknown action", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([estRow({ approvalId: "inst1" })]);
    const res = await APPROVE(req("POST", { action: "frobnicate" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown action/i);
  });

  it("approves the final step and flips the estimation to approved", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.$queryRaw.mockResolvedValue([estRow({ approvalId: "inst1", status: "pending_approval" })]);
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
    db.cnApprovalWorkflowStep.count.mockResolvedValue(1);
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("approve");
  });
});
