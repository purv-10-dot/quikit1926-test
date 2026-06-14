import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// documents/[id]/route exposes only DELETE, gated by
// withOrgAuthForModule("documents"). It removes the file via `deleteUpload`
// from @/lib/storage. Mock both the auth wrapper and the storage module.
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

const deleteUpload = vi.fn();
vi.mock("@/lib/storage", () => ({
  saveUpload: vi.fn(),
  readUpload: vi.fn(),
  deleteUpload: (...args: any[]) => deleteUpload(...args),
}));

const db = mockDb as any;
const ID = "d1";
const params = { params: { id: ID } };

const { DELETE } = await import("@/app/api/documents/[id]/route");

function req(): NextRequest {
  return new NextRequest(`http://localhost/api/documents/${ID}`, { method: "DELETE" });
}

beforeEach(() => {
  resetMockDb();
  setAuth(null);
  deleteUpload.mockReset();
  deleteUpload.mockResolvedValue(undefined);
});

describe("DELETE /api/documents/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req(), params)).status).toBe(401);
  });

  it("returns 404 when the document is not found in this org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnDocument.findFirst.mockResolvedValue(null);
    const res = await DELETE(req(), params);
    expect(res.status).toBe(404);
    expect(db.cnDocument.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });

  it("soft-deletes the row, removes the file, and returns success", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnDocument.findFirst.mockResolvedValue({ id: ID, storagePath: "org/abc.pdf" });
    db.cnDocument.update.mockResolvedValue({ id: ID });
    const res = await DELETE(req(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.cnDocument.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    expect(deleteUpload).toHaveBeenCalledWith("org/abc.pdf");
  });
});
