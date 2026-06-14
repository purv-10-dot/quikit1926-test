import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// ───────────────────────────────────────────────────────────────────
// settings/workflows gates via `withOrgAuthForResource("construction.
// workflows").manage` — the NextAuth + getTenantId + userCan pipeline,
// NOT the `@/lib/auth/context` surface the harness mocks. We mock
// `@/lib/api/withOrgAuth` directly with a faithful reimplementation:
//   - null auth      → 401
//   - forbidden flag → 403 (the userCan manage gate)
//   - otherwise      → handler invoked with { orgId, userId }
//   - thrown error   → 500 envelope { success:false, error }
// ───────────────────────────────────────────────────────────────────
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

// Import AFTER the mocks are registered.
const { GET, POST } = await import("@/app/api/settings/workflows/route");

function reqGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/settings/workflows${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}
function reqPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/settings/workflows", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setAuth(null);
  db.cnApprovalWorkflow.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/settings/workflows
// ═══════════════════════════════════════════════

describe("GET /api/settings/workflows", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(reqGET(), { params: {} })).status).toBe(401);
  });

  it("returns 403 when the manage permission is denied", async () => {
    setForbidden();
    expect((await GET(reqGET(), { params: {} })).status).toBe(403);
  });

  it("lists workflows scoped to the org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalWorkflow.findMany.mockResolvedValue([
      {
        id: "wf1",
        orgId: TEST_TENANT,
        projectId: null,
        name: "PO Approval",
        entityType: "po",
        isActive: true,
        steps: [],
        createdBy: TEST_USER,
        updatedBy: TEST_USER,
      },
    ]);
    const res = await GET(reqGET(), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.data[0].id).toBe("wf1");
    expect(db.cnApprovalWorkflow.findMany.mock.calls[0][0].where.orgId).toBe(
      TEST_TENANT,
    );
  });

  it("filters by entityType when provided", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    await GET(reqGET("entityType=po"), { params: {} });
    const where = db.cnApprovalWorkflow.findMany.mock.calls[0][0].where;
    expect(where.entityType).toBe("po");
  });

  it("filters to Default-only (projectId IS NULL) when projectId=default", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    await GET(reqGET("projectId=default"), { params: {} });
    const where = db.cnApprovalWorkflow.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBeNull();
  });

  it("filters to a specific project's overrides when projectId is a value", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    await GET(reqGET("projectId=proj-9"), { params: {} });
    const where = db.cnApprovalWorkflow.findMany.mock.calls[0][0].where;
    expect(where.projectId).toBe("proj-9");
  });
});

// ═══════════════════════════════════════════════
// POST /api/settings/workflows
// ═══════════════════════════════════════════════

describe("POST /api/settings/workflows", () => {
  it("returns 401 when unauthenticated", async () => {
    expect(
      (await POST(reqPOST({ name: "X", entityType: "po" }), { params: {} }))
        .status,
    ).toBe(401);
  });

  it("returns 403 when the manage permission is denied", async () => {
    setForbidden();
    expect(
      (await POST(reqPOST({ name: "X", entityType: "po" }), { params: {} }))
        .status,
    ).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const res = await POST(reqPOST({ entityType: "po" }), { params: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 when entityType is missing", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const res = await POST(reqPOST({ name: "X" }), { params: {} });
    expect(res.status).toBe(400);
  });

  it("creates a workflow scoped to the org and returns 201", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalWorkflow.create.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      projectId: null,
      name: "PO Approval",
      entityType: "po",
      isActive: true,
      steps: [],
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });
    const res = await POST(
      reqPOST({
        name: "PO Approval",
        entityType: "po",
        lines: [{ stepOrder: 1, approverRole: "admin" }],
      }),
      { params: {} },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("wf1");
    const data = db.cnApprovalWorkflow.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.projectId).toBeNull();
  });

  it("returns 500 when the repository throws", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalWorkflow.create.mockRejectedValue(new Error("db down"));
    const res = await POST(reqPOST({ name: "X", entityType: "po" }), {
      params: {},
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBeDefined();
  });
});
