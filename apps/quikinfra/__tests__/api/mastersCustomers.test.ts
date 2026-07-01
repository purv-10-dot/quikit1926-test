import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/customers/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/customers${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/customers", {
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
// GET /api/masters/customers
// ═══════════════════════════════════════════════

describe("GET /api/masters/customers — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnCustomer.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/customers — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the legacy {data,total} shape when unpaginated", async () => {
    db.cnCustomer.findMany.mockResolvedValue([
      { id: "cu1", orgId: TEST_TENANT, code: "CUS-001", name: "Acme", status: "active" },
      { id: "cu2", orgId: TEST_TENANT, code: "CUS-002", name: "Bolt", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].code).toBe("CUS-001");
  });

  it("scopes the query to the caller's org", async () => {
    db.cnCustomer.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnCustomer.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("excludes deleted rows so they leave the UI entirely", async () => {
    db.cnCustomer.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnCustomer.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "deleted" });
  });

  it("applies a search filter across code/name/contact", async () => {
    db.cnCustomer.findMany.mockResolvedValue([]);
    await GET(buildGET("search=Acme"));
    const where = db.cnCustomer.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR.some((c: any) => c.name?.contains === "Acme")).toBe(true);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnCustomer.findMany.mockResolvedValue([]);
    db.cnCustomer.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnCustomer.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnCustomer.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/customers
// ═══════════════════════════════════════════════

describe("POST /api/masters/customers — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ name: "Acme" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.masters.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST({ name: "Acme" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.masters.create"], {
        permissionMatrix: { "master.customer": { add: false } },
      }),
    );
    const res = await POST(buildPOST({ name: "Acme" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/customers — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });
});

describe("POST /api/masters/customers — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("auto-generates a code and creates a customer scoped to the org (201)", async () => {
    db.cnCustomer.count.mockResolvedValue(0);
    db.cnCustomer.create.mockResolvedValue({
      id: "cu1",
      orgId: TEST_TENANT,
      code: "CUS-001",
      name: "Acme",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST({ name: "Acme" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("cu1");

    const data = db.cnCustomer.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.name).toBe("Acme");
    expect(data.code).toBe("CUS-001");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnCustomer.count.mockResolvedValue(0);
    db.cnCustomer.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST({ name: "Dup", code: "CUS-001" }));
    expect(res.status).toBe(409);
  });
});
