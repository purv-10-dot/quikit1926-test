import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/categories/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-cat-1";

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/categories${qs ? "?" + qs : ""}`, { method: "GET" });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/categories", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function asAdmin() {
  setSession({ id: USER, tenantId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    tenantId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/categories — auth
// ═══════════════════════════════════════════════

describe("GET /api/categories — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// GET /api/categories — happy path
// ═══════════════════════════════════════════════

describe("GET /api/categories — happy path", () => {
  beforeEach(asAdmin);

  it("returns paginated categories for tenant", async () => {
    const items = [
      { id: "c1", name: "Revenue", dataType: "Currency", tenantId: TENANT },
      { id: "c2", name: "Count", dataType: "Number", tenantId: TENANT },
    ];
    mockDb.categoryMaster.findMany.mockResolvedValue(items as any);
    mockDb.categoryMaster.count.mockResolvedValue(2);

    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.meta.total).toBe(2);
  });

  it("filters by tenantId on queries", async () => {
    mockDb.categoryMaster.findMany.mockResolvedValue([]);
    mockDb.categoryMaster.count.mockResolvedValue(0);

    await GET(buildGET(), { params: {} as any });

    const findCall = mockDb.categoryMaster.findMany.mock.calls[0]?.[0] as any;
    expect(findCall.where.tenantId).toBe(TENANT);
  });

  it("applies search filter", async () => {
    mockDb.categoryMaster.findMany.mockResolvedValue([]);
    mockDb.categoryMaster.count.mockResolvedValue(0);

    await GET(buildGET("search=Revenue"), { params: {} as any });

    const findCall = mockDb.categoryMaster.findMany.mock.calls[0]?.[0] as any;
    expect(findCall.where.name).toEqual({ contains: "Revenue", mode: "insensitive" });
  });

  it("applies dataType filter", async () => {
    mockDb.categoryMaster.findMany.mockResolvedValue([]);
    mockDb.categoryMaster.count.mockResolvedValue(0);

    await GET(buildGET("dataType=Currency"), { params: {} as any });

    const findCall = mockDb.categoryMaster.findMany.mock.calls[0]?.[0] as any;
    expect(findCall.where.dataType).toBe("Currency");
  });
});

// ═══════════════════════════════════════════════
// POST /api/categories — auth
// ═══════════════════════════════════════════════

describe("POST /api/categories — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ name: "Test", dataType: "Number" }), { params: {} as any });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST({ name: "Test", dataType: "Number" }), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// POST /api/categories — validation
// ═══════════════════════════════════════════════

describe("POST /api/categories — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when name is empty", async () => {
    const res = await POST(buildPOST({ name: "", dataType: "Number" }), { params: {} as any });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when dataType is invalid", async () => {
    const res = await POST(buildPOST({ name: "Test", dataType: "Invalid" }), { params: {} as any });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/categories — happy path
// ═══════════════════════════════════════════════

describe("POST /api/categories — happy path", () => {
  beforeEach(asAdmin);

  it("creates category and returns 201", async () => {
    const created = { id: "c1", name: "Revenue", dataType: "Currency", tenantId: TENANT };
    mockDb.categoryMaster.create.mockResolvedValue(created as any);

    const res = await POST(
      buildPOST({ name: "Revenue", dataType: "Currency", currency: "USD" }),
      { params: {} as any },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("c1");
  });

  it("scopes creation to tenant and sets createdBy", async () => {
    mockDb.categoryMaster.create.mockResolvedValue({ id: "c1" } as any);

    await POST(
      buildPOST({ name: "Metric", dataType: "Number" }),
      { params: {} as any },
    );

    const call = mockDb.categoryMaster.create.mock.calls[0]?.[0] as any;
    expect(call.data.tenantId).toBe(TENANT);
    expect(call.data.createdBy).toBe(USER);
  });

  it("nullifies currency when dataType is not Currency", async () => {
    mockDb.categoryMaster.create.mockResolvedValue({ id: "c1" } as any);

    await POST(
      buildPOST({ name: "Metric", dataType: "Number", currency: "USD" }),
      { params: {} as any },
    );

    const call = mockDb.categoryMaster.create.mock.calls[0]?.[0] as any;
    expect(call.data.currency).toBeNull();
  });
});
