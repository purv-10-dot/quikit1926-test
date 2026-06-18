import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, TEST_TENANT } from "../setup";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/approvals/[id]/[action]/route";

const db = mockDb as any;
const INST = "ai-1";

function req(action: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/approvals/${INST}/${action}`, {
    method: "POST",
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

function params(action: string) {
  return { params: { id: INST, action } };
}

/** An approval instance row as the service's findFirst returns it. */
function instanceRow(over: Record<string, unknown> = {}) {
  return {
    id: INST,
    orgId: TEST_TENANT,
    workflowId: "wf1",
    entityType: "purchase_requisitions",
    entityId: "pr1",
    entityNumber: "MR-001",
    status: "pending_approval",
    currentStepOrder: 1,
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  // The service runs inside db.$transaction — pass the same mock db as tx.
  db.$transaction.mockImplementation(async (cb: any) => cb(db));
  // History / audit writes inside the txn.
  db.cnApprovalHistory.create.mockResolvedValue({ id: "h1" });
  db.cnAuditLog.create.mockResolvedValue({ id: "a1" });
  db.cnApprovalInstance.update.mockResolvedValue({});
  db.cnApprovalHistory.findFirst.mockResolvedValue(null);
});

// ═══════════════════════════════════════════════
// POST /api/approvals/[id]/[action]  (gate: requireAuth → approvalService.execute)
// ═══════════════════════════════════════════════

describe("POST /api/approvals/[id]/[action] — auth + validation", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(req("approve"), params("approve"))).status).toBe(401);
  });

  it("returns 400 on an unknown action", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    const res = await POST(req("frobnicate"), params("frobnicate"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown action/i);
  });

  it("returns 400 when reject is missing comments", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.cnApprovalInstance.findFirst.mockResolvedValue(instanceRow());
    const res = await POST(req("reject", {}), params("reject"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/comments are required/i);
  });

  it("returns 400 when the instance is not found", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.cnApprovalInstance.findFirst.mockResolvedValue(null);
    const res = await POST(req("approve"), params("approve"));
    expect(res.status).toBe(400); // INSTANCE_NOT_FOUND → ApprovalStateError (400)
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it("returns 409 when the instance is no longer pending", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.cnApprovalInstance.findFirst.mockResolvedValue(instanceRow({ status: "approved" }));
    db.cnApprovalHistory.findFirst.mockResolvedValue({ actionById: "u-prior", action: "approve", actionAt: new Date() });
    const res = await POST(req("approve"), params("approve"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("APPROVAL_CONFLICT");
  });

  it("returns 403 when the caller is not the step actor", async () => {
    // Regular admin (roleKey 'admin' → ADMIN, NOT super_admin) does NOT bypass
    // a step pinned to a different user.
    setContext(makeAdminCtx({ roleKey: "user" }));
    db.cnApprovalInstance.findFirst.mockResolvedValue(instanceRow());
    db.cnApprovalWorkflowStep.findFirst.mockResolvedValue({
      stepOrder: 1,
      approverUserId: "someone-else",
      approverUserIds: null,
      approverRoleId: null,
    });
    const res = await POST(req("approve"), params("approve"));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("APPROVAL_PERMISSION_DENIED");
  });
});

describe("POST /api/approvals/[id]/[action] — approve", () => {
  beforeEach(() => setContext(makeAdminCtx({ roleKey: "super_admin" })));

  it("approves the final step and marks the instance approved", async () => {
    db.cnApprovalInstance.findFirst.mockResolvedValue(instanceRow());
    db.cnApprovalWorkflowStep.findFirst.mockResolvedValue({
      stepOrder: 1, approverUserId: null, approverUserIds: null, approverRoleId: "SITE_ADMIN",
    });
    db.cnApprovalWorkflowStep.count.mockResolvedValue(1); // single step → final

    const res = await POST(req("approve"), params("approve"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe("approve");
    expect(body.newInstanceStatus).toBe("approved");
    expect(body.completedAt).toBeTruthy();
    // instance flipped to approved
    expect(db.cnApprovalInstance.update.mock.calls[0][0].data.status).toBe("approved");
    // history row written
    expect(db.cnApprovalHistory.create).toHaveBeenCalled();
  });

  it("advances to the next step on an intermediate approval", async () => {
    db.cnApprovalInstance.findFirst.mockResolvedValue(instanceRow({ currentStepOrder: 1 }));
    db.cnApprovalWorkflowStep.findFirst.mockResolvedValue({
      stepOrder: 1, approverUserId: null, approverUserIds: null, approverRoleId: "SITE_ADMIN",
    });
    db.cnApprovalWorkflowStep.count.mockResolvedValue(2); // 2 steps → not final

    const res = await POST(req("approve"), params("approve"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newInstanceStatus).toBe("pending_approval");
    expect(body.nextStepOrder).toBe(2);
    expect(db.cnApprovalInstance.update.mock.calls[0][0].data.currentStepOrder).toBe(2);
  });

  it("returns 409 when the same user already acted on this step", async () => {
    db.cnApprovalInstance.findFirst.mockResolvedValue(instanceRow());
    db.cnApprovalWorkflowStep.findFirst.mockResolvedValue({
      stepOrder: 1, approverUserId: null, approverUserIds: null, approverRoleId: "SITE_ADMIN",
    });
    // Double-action guard: prior history row by THIS user on this step.
    db.cnApprovalHistory.findFirst.mockResolvedValue({
      action: "approve", actionById: "user-test-1", actionAt: new Date(), stepOrder: 1,
    });
    db.cnApprovalWorkflowStep.count.mockResolvedValue(1);
    const res = await POST(req("approve"), params("approve"));
    expect(res.status).toBe(409);
  });
});

describe("POST /api/approvals/[id]/[action] — reject / return", () => {
  beforeEach(() => setContext(makeAdminCtx({ roleKey: "super_admin" })));

  function liveStep() {
    db.cnApprovalInstance.findFirst.mockResolvedValue(instanceRow());
    db.cnApprovalWorkflowStep.findFirst.mockResolvedValue({
      stepOrder: 1, approverUserId: null, approverUserIds: null, approverRoleId: "SITE_ADMIN",
    });
    db.cnApprovalWorkflowStep.count.mockResolvedValue(1);
  }

  it("rejects with a comment and marks the instance rejected", async () => {
    liveStep();
    const res = await POST(req("reject", { comments: "missing docs" }), params("reject"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newInstanceStatus).toBe("rejected");
    expect(db.cnApprovalInstance.update.mock.calls[0][0].data.status).toBe("rejected");
  });

  it("returns the instance to the raiser with a comment", async () => {
    liveStep();
    const res = await POST(req("return", { comments: "please revise quantities" }), params("return"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newInstanceStatus).toBe("returned");
    expect(body.action).toBe("return");
  });
});
