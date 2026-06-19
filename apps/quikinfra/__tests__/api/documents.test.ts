import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// documents/route gates via withOrgAuthForModule("documents") and writes
// uploads through `saveUpload` from @/lib/storage. Mock both: the auth
// wrapper as a faithful passthrough, and the storage module so no real IO
// occurs.
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

const saveUpload = vi.fn();
vi.mock("@/lib/storage", () => ({
  saveUpload: (...args: any[]) => saveUpload(...args),
  readUpload: vi.fn(),
  deleteUpload: vi.fn(),
}));

const db = mockDb as any;

const { GET, POST } = await import("@/app/api/documents/route");

function buildGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/documents${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}
function buildPOST(form: FormData): NextRequest {
  return new NextRequest("http://localhost/api/documents", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  resetMockDb();
  setAuth(null);
  saveUpload.mockReset();
  db.cnDocument.findMany.mockResolvedValue([]);
});

describe("GET /api/documents", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET(), { params: {} })).status).toBe(401);
  });

  it("lists documents scoped to the org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnDocument.findMany.mockResolvedValue([
      { id: "d1", orgId: TEST_TENANT, fileName: "plan.pdf" },
    ]);
    const res = await GET(buildGET(), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(db.cnDocument.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("applies refType/refId query filters", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    await GET(buildGET("refType=boq&refId=b1"), { params: {} });
    const where = db.cnDocument.findMany.mock.calls[0][0].where;
    expect(where.refType).toBe("boq");
    expect(where.refId).toBe("b1");
  });
});

describe("POST /api/documents", () => {
  it("returns 401 when unauthenticated", async () => {
    const form = new FormData();
    form.set("refType", "boq");
    form.set("refId", "b1");
    form.set("file", new File(["x"], "plan.pdf", { type: "application/pdf" }));
    expect((await POST(buildPOST(form), { params: {} })).status).toBe(401);
  });

  it("returns 400 when refType/refId are missing", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const form = new FormData();
    form.set("file", new File(["x"], "plan.pdf", { type: "application/pdf" }));
    const res = await POST(buildPOST(form), { params: {} });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the file is missing", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const form = new FormData();
    form.set("refType", "boq");
    form.set("refId", "b1");
    const res = await POST(buildPOST(form), { params: {} });
    expect(res.status).toBe(400);
  });

  it("saves the upload and creates a document row scoped to the org (201)", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    saveUpload.mockResolvedValue({
      storagePath: "org/abc.pdf",
      sizeBytes: 123,
      safeName: "plan.pdf",
    });
    db.cnDocument.create.mockResolvedValue({ id: "d1", orgId: TEST_TENANT, fileName: "plan.pdf" });
    const form = new FormData();
    form.set("refType", "boq");
    form.set("refId", "b1");
    form.set("file", new File(["hello"], "plan.pdf", { type: "application/pdf" }));
    const res = await POST(buildPOST(form), { params: {} });
    expect(res.status).toBe(201);
    expect(saveUpload).toHaveBeenCalledWith(TEST_TENANT, expect.any(File));
    const data = db.cnDocument.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.uploadedBy).toBe(TEST_USER);
    expect(data.storagePath).toBe("org/abc.pdf");
    expect(data.fileName).toBe("plan.pdf");
  });
});
