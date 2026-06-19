import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/purchase/requisitions/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/purchase/requisitions${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/purchase/requisitions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  // Read-time enrichment in the PR repository batch-fetches masters via
  // these findMany calls; default them to empty so `.map` never hits
  // undefined. Tests override the ones they assert on.
  db.cnProject.findMany.mockResolvedValue([]);
  db.cnItem.findMany.mockResolvedValue([]);
  db.cnUOM.findMany.mockResolvedValue([]);
  db.cnWorkCategory.findMany.mockResolvedValue([]);
  db.cnLocation.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/purchase/requisitions  (gate: construction.pr.view)
// ═══════════════════════════════════════════════

describe("GET /api/purchase/requisitions — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.pr.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });
});

describe("GET /api/purchase/requisitions — happy path", () => {
  beforeEach(() => setContext(makeUserCtx(["construction.pr.view"])));

  it("lists PRs scoped to the org with the legacy {data,total} shape", async () => {
    db.cnPurchaseRequisition.findMany.mockResolvedValue([
      {
        id: "pr1",
        orgId: TEST_TENANT,
        prNumber: "PR-SITE-26-0001",
        projectId: "proj1",
        status: "draft",
        lines: [],
        createdBy: TEST_USER,
        updatedBy: TEST_USER,
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.data[0].prNumber).toBe("PR-SITE-26-0001");
    // tenant scoping
    expect(db.cnPurchaseRequisition.findMany.mock.calls[0][0].where.orgId).toBe(
      TEST_TENANT,
    );
  });

  it("pushes take/skip + page shape when paginated", async () => {
    db.cnPurchaseRequisition.findMany.mockResolvedValue([]);
    const res = await GET(buildGET("page=2&pageSize=10"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(db.cnPurchaseRequisition.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnPurchaseRequisition.findMany.mock.calls[0][0].skip).toBe(10);
  });
});

// ═══════════════════════════════════════════════
// POST /api/purchase/requisitions  (gate: construction.pr.create + matrix purchase.mr:add)
// ═══════════════════════════════════════════════

describe("POST /api/purchase/requisitions — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({ projectId: "p1" }))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.pr.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST({ projectId: "p1" }))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.pr.create"], {
        permissionMatrix: { "purchase.mr": { add: false } },
      }),
    );
    expect((await POST(buildPOST({ projectId: "p1" }))).status).toBe(403);
  });
});

describe("POST /api/purchase/requisitions — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when projectId is missing", async () => {
    const res = await POST(buildPOST({ lines: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/project is required/i);
  });

  it("returns 404 when the project is not found in this org", async () => {
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST({ projectId: "missing" }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/purchase/requisitions — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a PR scoped to the org and returns 201", async () => {
    db.cnProject.findFirst.mockResolvedValue({
      id: "proj1",
      orgId: TEST_TENANT,
      code: "SITE",
      name: "Site A",
    });
    // estimation budget — no approved estimations → no budget cap
    db.$queryRaw.mockResolvedValue([]);
    // nextPrNumber scan — no existing PRs
    db.cnPurchaseRequisition.findMany.mockResolvedValue([]);
    db.cnPurchaseRequisition.create.mockResolvedValue({
      id: "pr1",
      orgId: TEST_TENANT,
      prNumber: "PR-SITE-26-0001",
      projectId: "proj1",
      status: "draft",
      lines: [],
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(
      buildPOST({
        projectId: "proj1",
        lines: [{ itemId: "i1", quantity: "5", uomId: "u1" }],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.prNumber).toBe("PR-SITE-26-0001");

    const data = db.cnPurchaseRequisition.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.prNumber).toBe("PR-SITE-26-0001");
    expect(data.status).toBe("draft");
  });

  it("returns 400 when a PR line exceeds the approved estimation budget", async () => {
    db.cnProject.findFirst.mockResolvedValue({
      id: "proj1",
      orgId: TEST_TENANT,
      code: "SITE",
      name: "Site A",
    });
    // one approved estimation: item i1 capped at 2 units
    db.$queryRaw.mockResolvedValue([
      {
        id: "est1",
        orgId: TEST_TENANT,
        projectId: "proj1",
        status: "approved",
        materials: [
          { itemId: "i1", itemName: "Cement", uomCode: "BAG", totalQty: 2 },
        ],
      },
    ]);
    // consumption scan — no existing live PRs
    db.cnPurchaseRequisition.findMany.mockResolvedValue([]);
    db.cnItem.findMany.mockResolvedValue([]);

    const res = await POST(
      buildPOST({
        projectId: "proj1",
        lines: [{ itemId: "i1", quantity: "5", uomId: "u1" }],
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("ESTIMATION_BUDGET_EXCEEDED");
  });
});
