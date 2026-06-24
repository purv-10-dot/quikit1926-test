import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/locations/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/locations${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/locations", {
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
// GET /api/masters/locations
// ═══════════════════════════════════════════════

describe("GET /api/masters/locations — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnLocation.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/locations — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the legacy {data,total} shape when unpaginated", async () => {
    db.cnLocation.findMany.mockResolvedValue([
      { id: "l1", orgId: TEST_TENANT, code: "LOC-001", name: "Warehouse", type: "warehouse", status: "active" },
      { id: "l2", orgId: TEST_TENANT, code: "LOC-002", name: "Site A", type: "site", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].code).toBe("LOC-001");
  });

  it("scopes the query to the caller's org", async () => {
    db.cnLocation.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnLocation.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("excludes deleted rows so they leave the UI entirely", async () => {
    db.cnLocation.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnLocation.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "deleted" });
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnLocation.findMany.mockResolvedValue([]);
    db.cnLocation.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnLocation.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnLocation.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/locations
// ═══════════════════════════════════════════════

describe("POST /api/masters/locations — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ name: "Warehouse", type: "warehouse" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.masters.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST({ name: "Warehouse", type: "warehouse" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.masters.create"], {
        permissionMatrix: { "master.location": { add: false } },
      }),
    );
    const res = await POST(buildPOST({ name: "Warehouse", type: "warehouse" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/locations — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({ type: "warehouse" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 when type is missing", async () => {
    const res = await POST(buildPOST({ name: "Warehouse" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });
});

describe("POST /api/masters/locations — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a location scoped to the org and returns 201", async () => {
    db.cnLocation.count.mockResolvedValue(0);
    db.cnLocation.create.mockResolvedValue({
      id: "l1",
      orgId: TEST_TENANT,
      code: "LOC-001",
      name: "Warehouse",
      type: "warehouse",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST({ name: "Warehouse", type: "warehouse" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("l1");

    const data = db.cnLocation.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.name).toBe("Warehouse");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnLocation.count.mockResolvedValue(0);
    db.cnLocation.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST({ name: "Dup", type: "warehouse" }));
    expect(res.status).toBe(409);
  });
});
