import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// settings/workflows/[id] gates via withOrgAuthForResource(...).manage —
// same passthrough mock as the list route. See settingsWorkflows.test.ts.
const _auth: {
  ctx: { orgId: string; userId: string } | null;
  forbidden: boolean;
} = { ctx: null, forbidden: false };

function setAuth(ctx: { orgId: string; userId: string } | null) {
  _auth.ctx = ctx;
  _auth.forbidden = false;
}
function setForbidden() {
  _auth.ctx = { orgId: TEST_TENANT, userId: TEST_USER };
  _auth.forbidden = true;
}

vi.mock("@/lib/api/withOrgAuth", () => {
  const wrap =
    (handler: any) =>
    async (req: NextRequest, routeCtx: any) => {
      if (!_auth.ctx) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
      if (_auth.forbidden) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }
      try {
        return await handler(
          { session: {}, userId: _auth.ctx.userId, orgId: _auth.ctx.orgId },
          req,
          routeCtx ?? { params: {} },
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Operation failed";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    };
  const resource = () => ({
    view: wrap, create: wrap, edit: wrap, delete: wrap,
    approve: wrap, import: wrap, importOrEdit: wrap,
    export: wrap, lock: wrap, manage: wrap,
  });
  return {
    withOrgAuth: (h: any) => wrap(h),
    withOrgAuthForModule: () => (h: any) => wrap(h),
    withOrgAuthForResource: resource,
    forbidden: () =>
      NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

const db = mockDb as any;
const ID = "wf1";
const params = { params: { id: ID } };

// The repository's updateWorkflow wraps step replacement in $transaction —
// run the callback against the same mock client so the inner tx writes hit
// our stubs.
function wireTransaction() {
  db.$transaction.mockImplementation(async (fn: any) =>
    typeof fn === "function" ? fn(db) : Promise.all(fn),
  );
}

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/settings/workflows/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

const { GET, PUT, PATCH, DELETE } = await import(
  "@/app/api/settings/workflows/[id]/route"
);

beforeEach(() => {
  resetMockDb();
  setAuth(null);
});

// ═══════════════════════════════════════════════
// GET /api/settings/workflows/[id]
// ═══════════════════════════════════════════════

describe("GET /api/settings/workflows/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the manage permission is denied", async () => {
    setForbidden();
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when the workflow is not found in this org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the workflow scoped to the org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      projectId: null,
      name: "PO Approval",
      entityType: "po",
      isActive: true,
      steps: [],
    });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
    expect(db.cnApprovalWorkflow.findFirst.mock.calls[0][0].where).toMatchObject(
      { id: ID, orgId: TEST_TENANT },
    );
  });
});

// ═══════════════════════════════════════════════
// PUT / PATCH /api/settings/workflows/[id]
// ═══════════════════════════════════════════════

describe("PATCH /api/settings/workflows/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PATCH(req("PATCH", { name: "X" }), params)).status).toBe(401);
  });

  it("returns 403 when the manage permission is denied", async () => {
    setForbidden();
    expect((await PATCH(req("PATCH", { name: "X" }), params)).status).toBe(403);
  });

  it("returns 404 when updating a missing workflow", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await PATCH(req("PATCH", { name: "X" }), params);
    expect(res.status).toBe(404);
  });

  it("updates and re-reads the workflow scoped to the org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    wireTransaction();
    // findFirst is called by updateWorkflow (existence check) and again by
    // findWorkflowById (re-read). Both must return the row.
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      projectId: null,
      name: "Renamed",
      entityType: "po",
      isActive: true,
      steps: [],
    });
    db.cnApprovalWorkflow.update.mockResolvedValue({ id: ID });
    db.cnApprovalWorkflowStep.deleteMany.mockResolvedValue({ count: 0 });
    db.cnApprovalWorkflowStep.createMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(
      req("PATCH", {
        name: "Renamed",
        steps: [{ stepOrder: 1, approverRole: "admin" }],
      }),
      params,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Renamed");
    expect(db.cnApprovalWorkflow.update.mock.calls[0][0].data.updatedBy).toBe(
      TEST_USER,
    );
  });

  it("PUT is aliased to PATCH (updates the workflow)", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    wireTransaction();
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      projectId: null,
      name: "Via PUT",
      entityType: "po",
      isActive: false,
      steps: [],
    });
    db.cnApprovalWorkflow.update.mockResolvedValue({ id: ID });
    const res = await PUT(req("PUT", { isActive: "false" }), params);
    expect(res.status).toBe(200);
    expect(db.cnApprovalWorkflow.update.mock.calls[0][0].data.isActive).toBe(
      false,
    );
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/settings/workflows/[id]
// ═══════════════════════════════════════════════

describe("DELETE /api/settings/workflows/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the manage permission is denied", async () => {
    setForbidden();
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when the workflow is not found", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("returns 409 when the workflow has approval instances (in use)", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({ id: ID });
    db.cnApprovalInstance.count.mockResolvedValue(3);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/cannot delete/i);
  });

  it("hard-deletes within the org and returns success", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({ id: ID });
    db.cnApprovalInstance.count.mockResolvedValue(0);
    db.cnApprovalWorkflow.delete.mockResolvedValue({ id: ID });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.cnApprovalWorkflow.findFirst.mock.calls[0][0].where).toMatchObject(
      { id: ID, orgId: TEST_TENANT },
    );
  });
});
