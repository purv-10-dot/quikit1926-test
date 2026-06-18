import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/assets/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/assets${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/assets", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID = { assetCode: "AST-001", name: "Excavator" };

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/masters/assets
// ═══════════════════════════════════════════════

describe("GET /api/masters/assets — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnAsset.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/assets — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the legacy {data,total} shape when unpaginated", async () => {
    db.cnAsset.findMany.mockResolvedValue([
      { id: "a1", orgId: TEST_TENANT, assetCode: "AST-001", name: "Excavator", status: "In Use" },
      { id: "a2", orgId: TEST_TENANT, assetCode: "AST-002", name: "Crane", status: "In Use" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].assetCode).toBe("AST-001");
  });

  it("scopes the query to the caller's org", async () => {
    db.cnAsset.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnAsset.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnAsset.findMany.mockResolvedValue([]);
    db.cnAsset.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnAsset.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnAsset.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/assets
// ═══════════════════════════════════════════════

describe("POST /api/masters/assets — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.masters.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.masters.create"], {
        permissionMatrix: { "master.asset": { add: false } },
      }),
    );
    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/assets — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when assetCode is missing", async () => {
    const res = await POST(buildPOST({ name: "Excavator" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({ assetCode: "AST-001" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/masters/assets — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates an asset scoped to the org and returns 201", async () => {
    db.cnAsset.create.mockResolvedValue({
      id: "a1",
      orgId: TEST_TENANT,
      assetCode: "AST-001",
      name: "Excavator",
      status: "In Use",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("a1");

    const data = db.cnAsset.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.name).toBe("Excavator");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnAsset.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST(VALID));
    expect(res.status).toBe(409);
  });
});
