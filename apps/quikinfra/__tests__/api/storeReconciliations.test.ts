import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/store/reconciliations/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/store/reconciliations${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/store/reconciliations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_BODY = {
  projectId: "proj1",
  locationId: "loc1",
  reconciliationDate: "2026-01-15",
  lines: [{ itemId: "i1", systemQty: 10, physicalQty: 8, varianceReason: "loss" }],
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
  // Repos batch-fetch masters + `.map` them — default to [] so map() is safe.
  db.cnItem.findMany.mockResolvedValue([]);
  db.cnUOM.findMany.mockResolvedValue([]);
  db.cnLocation.findMany.mockResolvedValue([]);
  db.cnStockReconciliation.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/store/reconciliations  (gate: construction.reconciliation.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/reconciliations", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.reconciliation.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("lists reconciliations scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnStockReconciliation.findMany.mockResolvedValue([
      {
        id: "r1",
        reconciliationNumber: "REC-001",
        projectId: "proj1",
        locationId: "loc1",
        reconciliationDate: new Date("2026-01-15"),
        conductedById: TEST_USER,
        approvedById: null,
        status: "draft",
        createdAt: new Date(),
        updatedAt: new Date(),
        project: { name: "Acme Tower" },
        _count: { lines: 2 },
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].reconciliationNumber).toBe("REC-001");
    expect(body.data[0].lineCount).toBe(2);
    expect(db.cnStockReconciliation.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/reconciliations  (gate: construction.reconciliation.create + matrix store.recon:add)
// ═══════════════════════════════════════════════

describe("POST /api/store/reconciliations", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST(VALID_BODY))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.reconciliation.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST(VALID_BODY))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.reconciliation.create"], {
        permissionMatrix: { "store.recon": { add: false } },
      }),
    );
    expect((await POST(buildPOST(VALID_BODY))).status).toBe(403);
  });

  it("returns 400 when projectId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ locationId: "loc1", reconciliationDate: "2026-01-15" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/project is required/i);
  });

  it("returns 400 when locationId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ projectId: "proj1", reconciliationDate: "2026-01-15" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/location is required/i);
  });

  it("returns 400 when reconciliationDate is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ projectId: "proj1", locationId: "loc1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/reconciliation date is required/i);
  });

  it("creates a reconciliation scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnItem.findMany.mockResolvedValue([{ id: "i1", uomId: "u1" }]);
    db.cnStockReconciliation.create.mockResolvedValue({
      id: "r1",
      reconciliationNumber: "REC-001",
      projectId: "proj1",
      locationId: "loc1",
      reconciliationDate: new Date("2026-01-15"),
      conductedById: TEST_USER,
      status: "draft",
      project: { name: "Acme Tower" },
      lines: [{ id: "l1" }],
      createdAt: new Date(),
    });
    const res = await POST(buildPOST(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("r1");
    const data = db.cnStockReconciliation.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.conductedById).toBe(TEST_USER);
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    setContext(makeAdminCtx());
    db.cnItem.findMany.mockResolvedValue([{ id: "i1", uomId: "u1" }]);
    db.cnStockReconciliation.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST(VALID_BODY));
    expect(res.status).toBe(409);
  });
});
