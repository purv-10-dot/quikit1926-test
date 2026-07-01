import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/departments/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/departments${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/departments", {
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
// GET /api/masters/departments
// ═══════════════════════════════════════════════

describe("GET /api/masters/departments — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnDepartment.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/departments — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the legacy {data,total} shape when unpaginated", async () => {
    db.cnDepartment.findMany.mockResolvedValue([
      { id: "d1", orgId: TEST_TENANT, code: "DEP-001", name: "Civil", status: "active" },
      { id: "d2", orgId: TEST_TENANT, code: "DEP-002", name: "MEP", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].code).toBe("DEP-001");
  });

  it("scopes the query to the caller's org", async () => {
    db.cnDepartment.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnDepartment.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("excludes deleted rows so they leave the UI entirely", async () => {
    db.cnDepartment.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnDepartment.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "deleted" });
  });

  it("applies a search filter across code/name/costCenter", async () => {
    db.cnDepartment.findMany.mockResolvedValue([]);
    await GET(buildGET("search=Civil"));
    const where = db.cnDepartment.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR.some((c: any) => c.name?.contains === "Civil")).toBe(true);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnDepartment.findMany.mockResolvedValue([]);
    db.cnDepartment.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnDepartment.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnDepartment.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/departments
// ═══════════════════════════════════════════════

describe("POST /api/masters/departments — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ code: "DEP-001", name: "Civil" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.masters.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST({ code: "DEP-001", name: "Civil" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.masters.create"], {
        permissionMatrix: { "org.department": { add: false } },
      }),
    );
    const res = await POST(buildPOST({ code: "DEP-001", name: "Civil" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/departments — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when code is missing", async () => {
    const res = await POST(buildPOST({ name: "Civil" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({ code: "DEP-001" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });
});

describe("POST /api/masters/departments — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a department scoped to the org and returns 201", async () => {
    db.cnDepartment.create.mockResolvedValue({
      id: "d1",
      orgId: TEST_TENANT,
      code: "DEP-001",
      name: "Civil",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST({ code: "DEP-001", name: "Civil" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("d1");

    const data = db.cnDepartment.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.code).toBe("DEP-001");
    expect(data.name).toBe("Civil");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnDepartment.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST({ code: "DEP-001", name: "Dup" }));
    expect(res.status).toBe(409);
  });
});
