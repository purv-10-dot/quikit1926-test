import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// safety/checklists gates via withOrgAuthForModule("safety"). Mock the
// wrapper with a faithful passthrough (401 unauth; thrown ZodError → 500).
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

const db = mockDb as any;

const { GET, POST } = await import("@/app/api/safety/checklists/route");

function buildGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/safety/checklists${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/safety/checklists", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  templateName: "Site Safety",
  checklistDate: "2026-01-02",
  completedBy: "Foreman",
  items: [
    { item: "helmets", ok: true },
    { item: "harness", ok: false, remarks: "missing" },
  ],
};

beforeEach(() => {
  resetMockDb();
  setAuth(null);
  db.cnSafetyChecklist.findMany.mockResolvedValue([]);
});

describe("GET /api/safety/checklists", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET(), { params: {} })).status).toBe(401);
  });

  it("lists checklists scoped to the org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnSafetyChecklist.findMany.mockResolvedValue([
      { id: "sc1", orgId: TEST_TENANT, templateName: "Site Safety", overallStatus: "pass" },
    ]);
    const res = await GET(buildGET(), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(db.cnSafetyChecklist.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

describe("POST /api/safety/checklists", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST(validBody), { params: {} })).status).toBe(401);
  });

  it("returns 500 on schema-invalid input (missing templateName)", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const res = await POST(
      buildPOST({ checklistDate: "2026-01-02", completedBy: "x", items: [] }),
      { params: {} },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it("creates a checklist scoped to the org, derives status, returns 201", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnSafetyChecklist.create.mockResolvedValue({
      id: "sc1",
      orgId: TEST_TENANT,
      templateName: "Site Safety",
      overallStatus: "partial",
    });
    const res = await POST(buildPOST(validBody), { params: {} });
    expect(res.status).toBe(201);
    const data = db.cnSafetyChecklist.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    // one of two items failed → partial
    expect(data.overallStatus).toBe("partial");
  });
});
