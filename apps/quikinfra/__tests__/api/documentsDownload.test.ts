import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// documents/[id]/download/route redirects to a presigned S3 URL. It gates
// via withOrgAuthForModule("documents") and resolves the URL through
// `getDownloadUrl` from @/lib/storage. Mock both: the auth wrapper
// (passthrough) and storage so no real S3 IO happens.
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

const getDownloadUrl = vi.fn();
vi.mock("@/lib/storage", () => ({
  saveUpload: vi.fn(),
  getDownloadUrl: (...args: any[]) => getDownloadUrl(...args),
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
  getDownloadUrl.mockReset();
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

  it("redirects to the presigned download URL on success", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnDocument.findFirst.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      storagePath: "documents/org/abc.pdf",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5,
    });
    getDownloadUrl.mockResolvedValue("https://s3.example/signed/plan.pdf?sig=abc");
    const res = await GET(req(), params);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://s3.example/signed/plan.pdf?sig=abc");
    expect(getDownloadUrl).toHaveBeenCalledWith("documents/org/abc.pdf", "plan.pdf");
  });
});
