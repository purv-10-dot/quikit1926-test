import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// quality/inspections/[id] gates via withOrgAuthForModule("quality").
// Mock @/lib/api/withOrgAuth with a faithful passthrough: 401 when no
// session, handler invoked with { orgId, userId }, thrown errors (ZodError)
// → 500 envelope — exactly like production.
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
const ID = "qi1";
const params = { params: { id: ID } };

const { GET, PATCH, DELETE } = await import("@/app/api/quality/inspections/[id]/route");

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/quality/inspections/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

const row = {
  id: ID,
  orgId: TEST_TENANT,
  inspectionNumber: "QI-2026-001",
  inspectorId: TEST_USER,
  inspectionDate: new Date("2026-01-02"),
  decision: "accepted",
  result: "Pass",
  items: [],
};

beforeEach(() => {
  resetMockDb();
  setAuth(null);
});

describe("GET /api/quality/inspections/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 404 when not found in this org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnQCInspection.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the row scoped to the org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnQCInspection.findFirst.mockResolvedValue(row);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(ID);
    expect(db.cnQCInspection.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

describe("PATCH /api/quality/inspections/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PATCH(req("PATCH", { status: "Closed" }), params)).status).toBe(401);
  });

  it("returns 500 on schema-invalid input (bad result enum)", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const res = await PATCH(req("PATCH", { result: "Maybe" }), params);
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it("returns 404 when updating a missing row", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnQCInspection.findFirst.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { status: "Closed" }), params)).status).toBe(404);
  });

  it("updates and stamps updatedBy", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnQCInspection.findFirst.mockResolvedValue({ id: ID });
    db.cnQCInspection.update.mockResolvedValue({ ...row, status: "Closed" });
    const res = await PATCH(req("PATCH", { status: "Closed" }), params);
    expect(res.status).toBe(200);
    expect(db.cnQCInspection.update.mock.calls[0][0].data.updatedBy).toBe(TEST_USER);
  });
});

describe("DELETE /api/quality/inspections/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("soft-deletes within the org and returns success", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnQCInspection.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const call = db.cnQCInspection.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: ID, orgId: TEST_TENANT });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });

  it("returns 404 when nothing was deleted", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnQCInspection.updateMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });
});
