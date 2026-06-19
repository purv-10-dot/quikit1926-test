import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/cost-centers/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/cost-centers${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/cost-centers", {
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
// GET /api/masters/cost-centers
// ═══════════════════════════════════════════════

describe("GET /api/masters/cost-centers — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnCostCenter.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/cost-centers — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the legacy {data,total} shape when unpaginated", async () => {
    db.cnCostCenter.findMany.mockResolvedValue([
      { id: "cc1", orgId: TEST_TENANT, code: "CC-001", name: "Ops", status: "active" },
      { id: "cc2", orgId: TEST_TENANT, code: "CC-002", name: "Admin", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].code).toBe("CC-001");
  });

  it("scopes the query to the caller's org", async () => {
    db.cnCostCenter.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnCostCenter.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("applies a search filter across code/name", async () => {
    db.cnCostCenter.findMany.mockResolvedValue([]);
    await GET(buildGET("search=Ops"));
    const where = db.cnCostCenter.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR.some((c: any) => c.name?.contains === "Ops")).toBe(true);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnCostCenter.findMany.mockResolvedValue([]);
    db.cnCostCenter.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnCostCenter.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnCostCenter.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/cost-centers
// ═══════════════════════════════════════════════

describe("POST /api/masters/cost-centers — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ code: "CC-001", name: "Ops" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.masters.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST({ code: "CC-001", name: "Ops" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.masters.create"], {
        permissionMatrix: { "master.cost_center": { add: false } },
      }),
    );
    const res = await POST(buildPOST({ code: "CC-001", name: "Ops" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/cost-centers — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when code is missing", async () => {
    const res = await POST(buildPOST({ name: "Ops" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({ code: "CC-001" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });
});

describe("POST /api/masters/cost-centers — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a cost center scoped to the org and returns 201", async () => {
    db.cnCostCenter.create.mockResolvedValue({
      id: "cc1",
      orgId: TEST_TENANT,
      code: "CC-001",
      name: "Ops",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST({ code: "CC-001", name: "Ops" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("cc1");

    const data = db.cnCostCenter.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.code).toBe("CC-001");
    expect(data.name).toBe("Ops");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnCostCenter.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST({ code: "CC-001", name: "Dup" }));
    expect(res.status).toBe(409);
  });
});
