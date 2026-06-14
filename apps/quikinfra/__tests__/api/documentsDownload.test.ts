import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// documents/[id]/download/route streams the stored file. It gates via
// withOrgAuthForModule("documents") and reads bytes through `readUpload`
// from @/lib/storage. Mock both: the auth wrapper (passthrough) and storage
// so no real filesystem/S3 IO happens.
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

const readUpload = vi.fn();
vi.mock("@/lib/storage", () => ({
  saveUpload: vi.fn(),
  readUpload: (...args: any[]) => readUpload(...args),
  deleteUpload: vi.fn(),
}));

const db = mockDb as any;
const ID = "d1";
const params = { params: { id: ID } };

const { GET } = await import("@/app/api/documents/[id]/download/route");

function req(): NextRequest {
  return new NextRequest(`http://localhost/api/documents/${ID}/download`, { method: "GET" });
}

beforeEach(() => {
  resetMockDb();
  setAuth(null);
  readUpload.mockReset();
});

describe("GET /api/documents/[id]/download", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req(), params)).status).toBe(401);
  });

  it("returns 404 when the document is not found in this org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnDocument.findFirst.mockResolvedValue(null);
    const res = await GET(req(), params);
    expect(res.status).toBe(404);
    expect(db.cnDocument.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });

  it("streams the file with content headers on success", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnDocument.findFirst.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      storagePath: "org/abc.pdf",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5,
    });
    readUpload.mockResolvedValue(Buffer.from("hello"));
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("plan.pdf");
    expect(readUpload).toHaveBeenCalledWith("org/abc.pdf");
  });
});
