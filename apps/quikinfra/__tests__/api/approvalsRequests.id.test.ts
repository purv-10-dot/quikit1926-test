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
const ID = "r1";
const params = { params: { id: ID } };

const { GET, PATCH } = await import("@/app/api/approvals/requests/[id]/route");

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/approvals/requests/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

beforeEach(() => {
  resetMockDb();
  setAuth(null);
});

// ═══════════════════════════════════════════════
// GET /api/approvals/requests/[id]
// ═══════════════════════════════════════════════

describe("GET /api/approvals/requests/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 404 when not found in this org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalRequest.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the request scoped to the org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalRequest.findFirst.mockResolvedValue({ id: ID, orgId: TEST_TENANT, status: "pending" });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(ID);
    expect(db.cnApprovalRequest.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// PATCH /api/approvals/requests/[id]  (decide: approved | rejected)
// ═══════════════════════════════════════════════

describe("PATCH /api/approvals/requests/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PATCH(req("PATCH", { decision: "approved" }), params)).status).toBe(401);
  });

  it("returns 500 on an invalid decision value", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const res = await PATCH(req("PATCH", { decision: "maybe" }), params);
    expect(res.status).toBe(500);
  });

  it("returns 404 when the request does not exist", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalRequest.findFirst.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { decision: "approved" }), params)).status).toBe(404);
  });

  it("returns 403 when the caller is not the designated approver", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalRequest.findFirst.mockResolvedValue({
      id: ID, approverId: "someone-else", status: "pending",
    });
    const res = await PATCH(req("PATCH", { decision: "approved" }), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/designated approver/i);
  });

  it("returns 400 when the request was already decided", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalRequest.findFirst.mockResolvedValue({
      id: ID, approverId: TEST_USER, status: "approved",
    });
    const res = await PATCH(req("PATCH", { decision: "rejected" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already approved/i);
  });

  it("records the decision when the approver acts on a pending request", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalRequest.findFirst.mockResolvedValue({
      id: ID, approverId: TEST_USER, status: "pending",
    });
    db.cnApprovalRequest.update.mockResolvedValue({ id: ID, status: "approved" });
    const res = await PATCH(req("PATCH", { decision: "approved", comment: "ok" }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const data = db.cnApprovalRequest.update.mock.calls[0][0].data;
    expect(data.status).toBe("approved");
    expect(data.comment).toBe("ok");
    expect(data.decisionAt).toBeInstanceOf(Date);
  });
});
