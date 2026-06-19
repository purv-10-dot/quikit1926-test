import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/purchase/indents/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/purchase/indents${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/purchase/indents", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  // Indent read-time enrichment batch-fetches items/uoms/vendors and
  // source-PR info; default to empty so `.map` never hits undefined.
  db.cnItem.findMany.mockResolvedValue([]);
  db.cnUOM.findMany.mockResolvedValue([]);
  db.cnVendor.findMany.mockResolvedValue([]);
  db.cnPurchaseRequisition.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/purchase/indents  (gate: construction.indent.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/indents — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.indent.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });
});

describe("GET /api/purchase/indents — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("lists indents scoped to the org with the legacy {data,total} shape", async () => {
    db.cnPurchaseIndent.findMany.mockResolvedValue([
      {
        id: "ind1",
        orgId: TEST_TENANT,
        indentNumber: "IND-SITE-26-0001",
        projectId: "proj1",
        status: "draft",
        lines: [],
        project: { id: "proj1", name: "Site A", code: "SITE" },
        createdBy: TEST_USER,
        updatedBy: TEST_USER,
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.data[0].indentNumber).toBe("IND-SITE-26-0001");
    expect(db.cnPurchaseIndent.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/indents  (gate: construction.indent.create + matrix purchase.indent:add)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/indents — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({ projectId: "p1" }))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.indent.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST({ projectId: "p1" }))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.indent.create"], {
        permissionMatrix: { "purchase.indent": { add: false } },
      }),
    );
    expect((await POST(buildPOST({ projectId: "p1" }))).status).toBe(403);
  });
});

describe("POST /api/purchase/indents — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when projectId is missing", async () => {
    const res = await POST(buildPOST({ directIndentReason: "urgent" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/project is required/i);
  });

  it("returns 400 when a direct indent has no justification reason", async () => {
    const res = await POST(buildPOST({ projectId: "proj1", lines: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("DIRECT_INDENT_REASON_REQUIRED");
  });

  it("returns 404 when the project is not found in this org", async () => {
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await POST(
      buildPOST({ projectId: "missing", directIndentReason: "urgent" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when the preferred vendor is blacklisted", async () => {
    db.cnProject.findFirst.mockResolvedValue({
      id: "proj1",
      orgId: TEST_TENANT,
      code: "SITE",
      name: "Site A",
    });
    db.cnVendor.findFirst.mockResolvedValue({ status: "blacklisted" });
    const res = await POST(
      buildPOST({
        projectId: "proj1",
        directIndentReason: "urgent",
        preferredVendorId: "v1",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/blacklisted/i);
  });
});

describe("POST /api/purchase/indents — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a direct indent scoped to the org and returns 201", async () => {
    db.cnProject.findFirst.mockResolvedValue({
      id: "proj1",
      orgId: TEST_TENANT,
      code: "SITE",
      name: "Site A",
    });
    // nextProjectScopedDocNumber scan — no existing indents
    db.cnPurchaseIndent.findMany.mockResolvedValue([]);
    // item master lookup for line enrichment in the route
    db.cnItem.findMany.mockResolvedValue([
      { id: "i1", code: "C1", name: "Cement", standardRate: "10", uomId: "u1", uom: { code: "BAG" } },
    ]);
    // resolveUomId — uomId resolves directly
    db.cnUOM.findFirst.mockResolvedValue({ id: "u1" });
    db.cnPurchaseIndent.create.mockResolvedValue({
      id: "ind1",
      orgId: TEST_TENANT,
      indentNumber: "IND-SITE-26-0001",
      projectId: "proj1",
      status: "draft",
      lines: [],
      project: { id: "proj1", name: "Site A", code: "SITE" },
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(
      buildPOST({
        projectId: "proj1",
        directIndentReason: "urgent site need",
        lines: [{ itemId: "i1", qtyRequested: "5", uomId: "u1", uomCode: "BAG" }],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.indentNumber).toBe("IND-SITE-26-0001");

    const data = db.cnPurchaseIndent.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.status).toBe("draft");
    expect(data.directIndentReason).toBe("urgent site need");
  });
});
