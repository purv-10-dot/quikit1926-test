import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/uom/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/uom${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/uom", {
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
// GET /api/masters/uom
// ═══════════════════════════════════════════════

describe("GET /api/masters/uom — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnUOM.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/uom — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the legacy {data,total} shape when unpaginated", async () => {
    db.cnUOM.findMany.mockResolvedValue([
      { id: "u1", orgId: TEST_TENANT, code: "KG", name: "Kilogram", precision: 2, status: "active" },
      { id: "u2", orgId: TEST_TENANT, code: "M", name: "Metre", precision: 0, status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].code).toBe("KG");
  });

  it("scopes the query to the caller's org", async () => {
    db.cnUOM.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnUOM.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("applies a search filter across code/name/type", async () => {
    db.cnUOM.findMany.mockResolvedValue([]);
    await GET(buildGET("search=KG"));
    const where = db.cnUOM.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR.some((c: any) => c.code?.contains === "KG")).toBe(true);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnUOM.findMany.mockResolvedValue([]);
    db.cnUOM.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnUOM.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnUOM.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/uom
// ═══════════════════════════════════════════════

describe("POST /api/masters/uom — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ code: "KG", name: "Kilogram" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.org_uom.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST({ code: "KG", name: "Kilogram" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.org_uom.create"], {
        permissionMatrix: { "org.uom": { add: false } },
      }),
    );
    const res = await POST(buildPOST({ code: "KG", name: "Kilogram" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/uom — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when code is missing", async () => {
    const res = await POST(buildPOST({ name: "Kilogram" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/code is required/i);
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({ code: "KG" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name is required/i);
  });
});

describe("POST /api/masters/uom — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a UOM scoped to the org and returns 201", async () => {
    db.cnUOM.create.mockResolvedValue({
      id: "u1",
      orgId: TEST_TENANT,
      code: "KG",
      name: "Kilogram",
      precision: 0,
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST({ code: "KG", name: "Kilogram" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("u1");

    const data = db.cnUOM.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.code).toBe("KG");
    expect(data.name).toBe("Kilogram");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnUOM.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST({ code: "KG", name: "Dup" }));
    expect(res.status).toBe(409);
  });
});
