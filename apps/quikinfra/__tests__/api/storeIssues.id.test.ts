import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/store/issues/[id]/route";
import { POST as SUBMIT } from "@/app/api/store/issues/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/store/issues/[id]/approve/route";
import { POST as LEGACY_APPROVE } from "@/app/api/store/issue/[id]/approve/route";

const db = mockDb as any;
const ID = "mi1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/store/issues/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

/** A material-issue row as findMaterialIssueById's raw SELECT returns it. */
function miRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    issueNumber: "MI-20260101-0001",
    projectId: "p1",
    status: "draft",
    approvalId: null,
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
// GET /api/store/issues/[id]  (gate: construction.issue.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/issues/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.issue.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when the issue is not in this org", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]); // findMaterialIssueById → no rows
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the issue with a null approval block when not submitted", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([miRow()]);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(ID);
    expect(body.approval).toBeNull();
  });
});

// ═══════════════════════════════════════════════
// PUT /api/store/issues/[id]  (gate: construction.issue.edit + matrix store.issue:edit)
// ═══════════════════════════════════════════════

describe("PUT /api/store/issues/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PUT(req("PUT", { remarks: "x" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.issue.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await PUT(req("PUT", { remarks: "x" }), params)).status).toBe(403);
  });

  it("returns 404 when updating a missing row", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]); // findMaterialIssueById
    expect((await PUT(req("PUT", { remarks: "x" }), params)).status).toBe(404);
  });

  it("updates editable fields and returns the patched row", async () => {
    setContext(makeAdminCtx());
    // 1: existing lookup, 2: updateMaterialIssue's internal find, 3: re-read
    db.$queryRaw.mockResolvedValue([miRow()]);
    const res = await PUT(req("PUT", { remarks: "Updated note" }), params);
    expect(res.status).toBe(200);
    expect(db.$executeRaw).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/store/issues/[id]  (gate: construction.issue.delete + matrix store.issue:delete)
// ═══════════════════════════════════════════════

describe("DELETE /api/store/issues/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.issue.delete", async () => {
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
    db.$queryRaw.mockResolvedValue([miRow()]);
    db.$executeRaw.mockResolvedValue(1); // deleteMaterialIssue affected rows
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/issues/[id]/submit  (gate: construction.issue.create + matrix store.issue:edit)
// ═══════════════════════════════════════════════

describe("POST /api/store/issues/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.issue.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the issue does not exist", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([]);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the issue is not in draft", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([miRow({ status: "pending_approval" })]);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([miRow()]);
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active material issue workflow/i);
  });

  it("submits and moves the issue into pending_approval", async () => {
    // A USER raiser does not outrank the SITE_ADMIN step → stays live.
    setContext(makeUserCtx(["construction.issue.create"]));
    db.$queryRaw.mockResolvedValue([miRow()]);
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "material_issues",
      isActive: true,
      projectId: "p1",
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
// POST /api/store/issues/[id]/approve  (gate: construction.issue.approve + matrix store.issue:edit)
// ═══════════════════════════════════════════════

describe("POST /api/store/issues/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.issue.approve", async () => {
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

  it("returns 400 when the issue has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.$queryRaw.mockResolvedValue([miRow({ approvalId: null })]);
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("approves the final step and flips the issue to approved", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.$queryRaw.mockResolvedValue([miRow({ approvalId: "inst1", status: "pending_approval" })]);
    db.cnApprovalInstance.findFirst.mockResolvedValue({
      id: "inst1",
      orgId: TEST_TENANT,
      workflowId: "wf1",
      status: "pending_approval",
      currentStepOrder: 1,
    });
    db.cnApprovalWorkflowStep.findFirst
      .mockResolvedValueOnce({ stepOrder: 1, approverUserId: null, approverRoleId: "SITE_ADMIN" }) // current step
      .mockResolvedValueOnce(null); // no next step → final
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
// POST /api/store/issue/[id]/approve  (LEGACY — handleApprovalAction + stock outward)
// gate: construction.issue.approve + matrix store.issue:edit
// ═══════════════════════════════════════════════

describe("POST /api/store/issue/[id]/approve (legacy)", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await LEGACY_APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.issue.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await LEGACY_APPROVE(req("POST", { action: "approve" }), params)).status).toBe(403);
  });

  it("returns 404 when the issue does not exist (Prisma-model lookup)", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue(null);
    const res = await LEGACY_APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(404);
  });

  it("returns 400 when reject is missing comments", async () => {
    setContext(makeAdminCtx());
    const res = await LEGACY_APPROVE(req("POST", { action: "reject" }), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.message ?? body.error).toBeDefined();
  });
});
