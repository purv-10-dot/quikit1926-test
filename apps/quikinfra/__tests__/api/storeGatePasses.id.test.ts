import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, DELETE, PATCH } from "@/app/api/store/gate-passes/[id]/route";
import { POST as SUBMIT } from "@/app/api/store/gate-passes/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/store/gate-passes/[id]/approve/route";
import { POST as CLOSE } from "@/app/api/store/gate-passes/[id]/close/route";

const db = mockDb as any;
const ID = "gp1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/store/gate-passes/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

/** Raw `Gate_passes` row for the repository's $queryRaw. */
function rawRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    gatePassNumber: "GP-OUT-26-001",
    type: "outward",
    projectId: "proj1",
    projectName: "Acme Tower",
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
// GET /api/store/gate-passes/[id]
// ═══════════════════════════════════════════════

describe("GET /api/store/gate-passes/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.gatepass.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]); // findGatePassById → null
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the gate pass scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow()]);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/store/gate-passes/[id]
// ═══════════════════════════════════════════════

describe("DELETE /api/store/gate-passes/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.gatepass.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when deleting a missing row", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]); // findGatePassById → null
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("deletes within the org and returns success", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow()]); // findGatePassById
    db.$executeRaw.mockResolvedValue(1); // deleteGatePass affected rows
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// PATCH /api/store/gate-passes/[id]
// ═══════════════════════════════════════════════

describe("PATCH /api/store/gate-passes/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PATCH(req("PATCH", { remarks: "x" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.gatepass.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await PATCH(req("PATCH", { remarks: "x" }), params)).status).toBe(403);
  });

  it("returns 404 when updating a missing row", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]); // findGatePassById → null
    expect((await PATCH(req("PATCH", { remarks: "x" }), params)).status).toBe(404);
  });

  it("updates editable fields and returns the row", async () => {
    setContext(makeAdminCtx());
    // existing (route), then updateGatePass: findGatePassById (existing) +
    // findGatePassById (final). Same shape each time.
    db.$queryRaw.mockResolvedValue([rawRow()]);
    db.$executeRaw.mockResolvedValue(1);
    const res = await PATCH(req("PATCH", { remarks: "updated" }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/gate-passes/[id]/submit
// ═══════════════════════════════════════════════

describe("POST /api/store/gate-passes/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.gatepass.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the gate pass does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]); // findGatePassById → null
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the gate pass is not in draft", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow({ status: "pending_approval" })]);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow()]); // draft
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active gate pass workflow/i);
  });

  it("submits and moves the gate pass into the workflow (pending)", async () => {
    // A plain USER raiser does not fill the SITE_ADMIN step → it stays live.
    setContext(makeUserCtx(["construction.gatepass.create"]));
    db.$queryRaw.mockResolvedValue([rawRow()]); // findGatePassById (draft) + patch lookups
    db.$executeRaw.mockResolvedValue(1);
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "gate_pass",
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
// POST /api/store/gate-passes/[id]/approve
// ═══════════════════════════════════════════════

describe("POST /api/store/gate-passes/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.gatepass.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(403);
  });

  it("returns 400 on an unknown action", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow({ approvalId: "inst1" })]);
    const res = await APPROVE(req("POST", { action: "frobnicate" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown action/i);
  });

  it("returns 404 when the gate pass does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]); // findGatePassById → null
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(404);
  });

  it("returns 400 when the gate pass has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow({ approvalId: null })]);
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("approves the final step and flips the gate pass to approved", async () => {
    // super_admin passes canActOnStep regardless of the pinned approver.
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.$queryRaw.mockResolvedValue([rawRow({ approvalId: "inst1" })]); // findGatePassById (+ refreshed)
    db.$executeRaw.mockResolvedValue(1);
    db.cnApprovalInstance.findFirst.mockResolvedValue({
      id: "inst1",
      orgId: TEST_TENANT,
      workflowId: "wf1",
      status: "pending_approval",
      currentStepOrder: 1,
    });
    db.cnApprovalWorkflowStep.findFirst
      .mockResolvedValueOnce({ stepOrder: 1, approverUserId: null, approverRoleId: "SITE_ADMIN" }) // current
      .mockResolvedValueOnce(null); // no next step → final
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
// POST /api/store/gate-passes/[id]/close
// ═══════════════════════════════════════════════

describe("POST /api/store/gate-passes/[id]/close", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await CLOSE(req("POST", {}), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.gatepass.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await CLOSE(req("POST", {}), params)).status).toBe(403);
  });

  it("returns 404 when the gate pass does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]); // findGatePassById → null
    expect((await CLOSE(req("POST", {}), params)).status).toBe(404);
  });

  it("returns 400 when closing from a non-closeable status", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([rawRow({ status: "draft" })]);
    const res = await CLOSE(req("POST", {}), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot close/i);
  });

  it("closes an approved gate pass and stamps status=closed", async () => {
    setContext(makeAdminCtx());
    // route find (approved) → patch existing lookup (approved) → patch final lookup (closed)
    db.$queryRaw
      .mockResolvedValueOnce([rawRow({ status: "approved" })])
      .mockResolvedValueOnce([rawRow({ status: "approved" })])
      .mockResolvedValueOnce([rawRow({ status: "closed" })]);
    db.$executeRaw.mockResolvedValue(1);
    const res = await CLOSE(req("POST", { remarks: "done" }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("closed");
  });
});
