import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/purchase/rfqs/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/purchase/rfqs${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/purchase/rfqs", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/purchase/rfqs  (gate: construction.rfq.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/rfqs", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rfq.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("lists RFQs scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findMany.mockResolvedValue([]); // loadLookups project join
    db.cnRfq.findMany.mockResolvedValue([
      {
        id: "rfq1",
        orgId: TEST_TENANT,
        rfqNumber: "RFQ-SITE-26-0001",
        projectId: "proj1",
        status: "draft",
        lines: [],
        vendors: [],
        createdBy: TEST_USER,
        updatedBy: TEST_USER,
        termsTemplateId: null,
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(db.cnRfq.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/rfqs  (gate: construction.rfq.create + matrix purchase.rfq:add)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/rfqs", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({}))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rfq.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST({}))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.rfq.create"], {
        permissionMatrix: { "purchase.rfq": { add: false } },
      }),
    );
    expect((await POST(buildPOST({}))).status).toBe(403);
  });

  it("returns 400 when projectId cannot be resolved", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ vendorIds: ["v1"], lines: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/projectid/i);
  });

  it("returns 404 when the project is not found", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue(null); // findProjectById → null
    const res = await POST(buildPOST({ projectId: "proj1", vendors: [], lines: [] }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/project not found/i);
  });

  it("creates a draft RFQ scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({
      id: "proj1",
      orgId: TEST_TENANT,
      code: "SITE",
      name: "Site One",
      client: null,
    });
    db.cnItem.findMany.mockResolvedValue([]);
    db.cnProject.findMany.mockResolvedValue([]); // loadLookups project join
    db.cnRfq.findMany.mockResolvedValue([]); // doc-number scan
    db.cnRfq.create.mockResolvedValue({
      id: "rfq1",
      orgId: TEST_TENANT,
      rfqNumber: "RFQ-SITE-26-0001",
      projectId: "proj1",
      status: "draft",
      lines: [],
      vendors: [],
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
      termsTemplateId: null,
    });

    const res = await POST(buildPOST({ projectId: "proj1", vendors: [], lines: [] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("rfq1");
    const created = db.cnRfq.create.mock.calls[0][0].data;
    expect(created.orgId).toBe(TEST_TENANT);
    expect(created.createdBy).toBe(TEST_USER);
  });
});
