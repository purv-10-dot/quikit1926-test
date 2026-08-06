import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/store/good-returns/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/store/good-returns${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/store/good-returns", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Raw `Good_returns` row for the repository's $queryRaw. */
function rawRow(over: Record<string, unknown> = {}) {
  return {
    id: "gr1",
    orgId: TEST_TENANT,
    returnNumber: "GR-20260115-0001",
    projectId: "proj1",
    projectName: "Acme Tower",
    vendorId: "v1",
    vendorName: "Bolt Supplies",
    status: "draft",
    materials: [],
    lineCount: 0,
    createdBy: TEST_USER,
    updatedBy: TEST_USER,
    ...over,
  };
}

const VALID_BODY = {
  projectId: "proj1",
  vendorId: "v1",
  returnDate: "2026-01-15",
  lines: [],
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/store/good-returns  (gate: construction.return.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/good-returns", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.return.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("lists good returns scoped to the org and returns {data,total}", async () => {
    setContext(makeAdminCtx());
    // listGoodReturns issues TWO raw queries in parallel — the page of rows
    // and a COUNT(*) — so each needs its own resolution.
    db.$queryRaw
      .mockResolvedValueOnce([
        rawRow(),
        rawRow({ id: "gr2", returnNumber: "GR-20260115-0002" }),
      ])
      .mockResolvedValueOnce([{ count: 2 }]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(JSON.stringify(db.$queryRaw.mock.calls[0])).toContain(TEST_TENANT);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/good-returns  (gate: construction.return.create + matrix store.good_return:add)
// ═══════════════════════════════════════════════

describe("POST /api/store/good-returns", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST(VALID_BODY))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.return.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST(VALID_BODY))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.return.create"], {
        permissionMatrix: { "store.good_return": { add: false } },
      }),
    );
    expect((await POST(buildPOST(VALID_BODY))).status).toBe(403);
  });

  it("returns 400 when projectId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ vendorId: "v1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/projectId is required/i);
  });

  it("returns 400 when vendorId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ projectId: "proj1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/vendorId is required/i);
  });

  it("returns 404 when the project does not exist in this org", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST(VALID_BODY));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/project .* not found/i);
  });

  it("returns 404 when the vendor does not exist in this org", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: "proj1", name: "Acme Tower" });
    db.cnVendor.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST(VALID_BODY));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/vendor .* not found/i);
  });

  it("creates a good return scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: "proj1", name: "Acme Tower" });
    db.cnVendor.findFirst.mockResolvedValue({ id: "v1", companyName: "Bolt Supplies" });
    // countGoodReturnsForDate COUNT → 0, then findGoodReturnById after insert
    db.$queryRaw
      .mockResolvedValueOnce([{ c: 0 }])
      .mockResolvedValueOnce([rawRow()]);
    db.$executeRaw.mockResolvedValue(1);

    const res = await POST(buildPOST(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("gr1");
    expect(db.$executeRaw).toHaveBeenCalled();
    // project/vendor were resolved tenant-scoped
    expect(db.cnProject.findFirst.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});
