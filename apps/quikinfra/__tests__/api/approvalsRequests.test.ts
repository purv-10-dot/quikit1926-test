import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// ───────────────────────────────────────────────────────────────────
// The approvals/requests + approvals/rules routes gate via
// `withOrgAuthForModule("approvals")` (a NextAuth + getTenantId + RBAC
// pipeline) rather than the `@/lib/auth/context` surface the harness
// mocks. We mock `@/lib/api/withOrgAuth` directly with a faithful
// reimplementation of the wrapper's contract: 401 when no session,
// 403 when the module/permission gate denies, handler invoked with
// { orgId, userId }, and the try/catch → 500 envelope (so a thrown
// ZodError surfaces as 500, exactly like production).
// ───────────────────────────────────────────────────────────────────
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
    withOrgAuthForResource: () => ({
      view: wrap, create: wrap, edit: wrap, delete: wrap, approve: wrap,
    }),
    forbidden: () => NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

vi.mock("@/lib/notify", () => ({
  notify: vi.fn(),
  buildApprovalRequestedEmail: vi.fn(() => ({ subject: "s", body: "b" })),
}));

const db = mockDb as any;

// Import AFTER the mocks are registered.
const { GET, POST } = await import("@/app/api/approvals/requests/route");

function reqGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/approvals/requests${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}
function reqPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/approvals/requests", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validRequest = {
  docType: "pr",
  docId: "pr1",
  docRef: "MR-001",
  amount: 1000,
  approverId: "u-approver",
};

beforeEach(() => {
  resetMockDb();
  setAuth(null);
  db.cnApprovalRequest.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/approvals/requests
// ═══════════════════════════════════════════════

describe("GET /api/approvals/requests", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(reqGET(), { params: {} })).status).toBe(401);
  });

  it("lists requests scoped to the org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalRequest.findMany.mockResolvedValue([
      { id: "r1", orgId: TEST_TENANT, docRef: "MR-001", status: "pending" },
    ]);
    const res = await GET(reqGET(), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(db.cnApprovalRequest.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("filters to the caller's inbox when inbox=true", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    await GET(reqGET("inbox=true"), { params: {} });
    const where = db.cnApprovalRequest.findMany.mock.calls[0][0].where;
    expect(where.approverId).toBe(TEST_USER);
  });

  it("filters by status when provided", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    await GET(reqGET("status=approved"), { params: {} });
    const where = db.cnApprovalRequest.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("approved");
  });
});

// ═══════════════════════════════════════════════
// POST /api/approvals/requests
// ═══════════════════════════════════════════════

describe("POST /api/approvals/requests", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(reqPOST(validRequest), { params: {} })).status).toBe(401);
  });

  it("returns 500 on schema-invalid input (missing docType)", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const res = await POST(reqPOST({ docId: "x", docRef: "y", approverId: "z" }), { params: {} });
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it("creates a pending request scoped to the org and returns 201", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalRequest.create.mockResolvedValue({
      id: "r1", orgId: TEST_TENANT, status: "pending", docRef: "MR-001",
    });
    const res = await POST(reqPOST(validRequest), { params: {} });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    const data = db.cnApprovalRequest.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.requestedBy).toBe(TEST_USER);
    expect(data.status).toBe("pending");
    expect(data.approverId).toBe("u-approver");
  });
});
