import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/contractors/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/contractors${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/contractors", {
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
// GET /api/masters/contractors
// ═══════════════════════════════════════════════

describe("GET /api/masters/contractors — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([])); // no masters perms at all
    db.cnContractor.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/contractors — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the legacy {data,total} shape when unpaginated", async () => {
    db.cnContractor.findMany.mockResolvedValue([
      { id: "c1", orgId: TEST_TENANT, code: "CON-001", name: "Acme", status: "active" },
      { id: "c2", orgId: TEST_TENANT, code: "CON-002", name: "Bolt", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].code).toBe("CON-001");
  });

  it("scopes the query to the caller's org", async () => {
    db.cnContractor.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnContractor.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("applies a search filter across code/name/contact", async () => {
    db.cnContractor.findMany.mockResolvedValue([]);
    await GET(buildGET("search=Acme"));
    const where = db.cnContractor.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR.some((c: any) => c.name?.contains === "Acme")).toBe(true);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnContractor.findMany.mockResolvedValue([]);
    db.cnContractor.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnContractor.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnContractor.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/contractors
// ═══════════════════════════════════════════════

describe("POST /api/masters/contractors — auth", () => {
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
        permissionMatrix: { "master.contractor": { add: false } },
      }),
    );
    const res = await POST(buildPOST({ name: "Acme" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/contractors — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 on an invalid mobile", async () => {
    const res = await POST(buildPOST({ name: "Acme", phone: "123" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on an invalid email", async () => {
    const res = await POST(buildPOST({ name: "Acme", email: "nope" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on an invalid GSTIN", async () => {
    const res = await POST(buildPOST({ name: "Acme", gstin: "BADGSTIN" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/masters/contractors — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a contractor scoped to the org and returns 201", async () => {
    db.cnContractor.count.mockResolvedValue(0);
    db.cnContractor.create.mockResolvedValue({
      id: "c1",
      orgId: TEST_TENANT,
      code: "CON-001",
      name: "Acme",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST({ name: "Acme", phone: "9876543210" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("c1");

    const data = db.cnContractor.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.name).toBe("Acme");
    expect(data.phone).toBe("9876543210");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnContractor.count.mockResolvedValue(0);
    db.cnContractor.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST({ name: "Dup" }));
    expect(res.status).toBe(409);
  });
});
