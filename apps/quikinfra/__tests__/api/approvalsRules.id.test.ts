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
const ID = "rule1";
const params = { params: { id: ID } };

const { DELETE } = await import("@/app/api/approvals/rules/[id]/route");

function req(): NextRequest {
  return new NextRequest(`http://localhost/api/approvals/rules/${ID}`, { method: "DELETE" });
}

beforeEach(() => {
  resetMockDb();
  setAuth(null);
});

// ═══════════════════════════════════════════════
// DELETE /api/approvals/rules/[id]  (soft delete — sets deletedAt)
// ═══════════════════════════════════════════════

describe("DELETE /api/approvals/rules/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req(), params)).status).toBe(401);
  });

  it("soft-deletes the rule and stamps updatedBy", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnApprovalRule.update.mockResolvedValue({ id: ID, deletedAt: new Date() });
    const res = await DELETE(req(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const call = db.cnApprovalRule.update.mock.calls[0][0];
    expect(call.where.id).toBe(ID);
    expect(call.data.deletedAt).toBeInstanceOf(Date);
    expect(call.data.updatedBy).toBe(TEST_USER);
  });
});
