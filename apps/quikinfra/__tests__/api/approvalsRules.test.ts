import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

const _auth: { ctx: { orgId: string; userId: string } | null } = { ctx: null };
function setAuth(ctx: { orgId: string; userId: string } | null) {
  _auth.ctx = ctx;
}

vi.mock("@/lib/api/withOrgAuth", () => {
  const wrap =
    (handler: any) =>
    async (req: NextRequest, routeCtx: any) => {
      if (!_auth.ctx) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
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
  return {
    withOrgAuth: (h: any) => wrap(h),
    withOrgAuthForModule: () => (h: any) => wrap(h),
    withOrgAuthForResource: () => ({ view: wrap, create: wrap, edit: wrap, delete: wrap, approve: wrap }),
    forbidden: () => NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

const db = mockDb as any;

const { GET, POST } = await import("@/app/api/approvals/rules/route");

function reqGET(): NextRequest {
  return new NextRequest("http://localhost/api/approvals/rules", { method: "GET" });
}
function reqPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/approvals/rules", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validRule = { name: "PR > 10k needs MD", docType: "pr", minAmount: 10000, approverId: "u-md" };

beforeEach(() => {
  resetMockDb();
  setAuth(null);
  db.cnApprovalRule.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/approvals/rules
// ═══════════════════════════════════════════════

describe("GET /api/approvals/rules", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(reqGET(), { params: {} })).status).toBe(401);
  });

  it("lists active (non-deleted) rules scoped to the org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalRule.findMany.mockResolvedValue([
      { id: "rule1", orgId: TEST_TENANT, docType: "pr", minAmount: 10000 },
    ]);
    const res = await GET(reqGET(), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    const where = db.cnApprovalRule.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
    expect(where.deletedAt).toBeNull();
  });
});

// ═══════════════════════════════════════════════
// POST /api/approvals/rules
// ═══════════════════════════════════════════════

describe("POST /api/approvals/rules", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(reqPOST(validRule), { params: {} })).status).toBe(401);
  });

  it("returns 500 when the rule fails schema validation (missing name)", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const res = await POST(reqPOST({ docType: "pr", approverId: "u-md" }), { params: {} });
    expect(res.status).toBe(500);
  });

  it("returns 500 on an invalid docType enum", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const res = await POST(reqPOST({ name: "x", docType: "invoice", approverId: "u-md" }), { params: {} });
    expect(res.status).toBe(500);
  });

  it("creates a rule scoped to the org and returns 201", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalRule.create.mockResolvedValue({ id: "rule1", orgId: TEST_TENANT, ...validRule });
    const res = await POST(reqPOST(validRule), { params: {} });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    const data = db.cnApprovalRule.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.docType).toBe("pr");
    expect(data.minAmount).toBe(10000);
  });
});
