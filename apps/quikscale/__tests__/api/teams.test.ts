import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/teams/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-teams-1";

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/teams${qs ? "?" + qs : ""}`, { method: "GET" });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/teams", {
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
// GET /api/teams — auth
// ═══════════════════════════════════════════════

describe("GET /api/teams — auth", () => {
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
// GET /api/teams — happy path
// ═══════════════════════════════════════════════

describe("GET /api/teams — happy path", () => {
  beforeEach(asAdmin);

  it("returns paginated teams for tenant", async () => {
    const teams = [
      { id: "t1", name: "Engineering" },
      { id: "t2", name: "Sales" },
    ];
    mockDb.team.findMany.mockResolvedValue(teams as any);
    mockDb.team.count.mockResolvedValue(2);

    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.meta.total).toBe(2);
  });

  it("filters by tenantId (soft delete handled by middleware)", async () => {
    mockDb.team.findMany.mockResolvedValue([]);
    mockDb.team.count.mockResolvedValue(0);

    await GET(buildGET(), { params: {} as any });

    const call = mockDb.team.findMany.mock.calls[0]?.[0] as any;
    expect(call.where.tenantId).toBe(TENANT);
    // deletedAt filtering is handled by the Prisma soft-delete middleware
  });
});

// ═══════════════════════════════════════════════
// POST /api/teams — auth
// ═══════════════════════════════════════════════

describe("POST /api/teams — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ name: "New Team" }), { params: {} as any });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST({ name: "New Team" }), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// POST /api/teams — validation
// ═══════════════════════════════════════════════

describe("POST /api/teams — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when name is empty", async () => {
    const res = await POST(buildPOST({ name: "" }), { params: {} as any });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// POST /api/teams — duplicate check
// ═══════════════════════════════════════════════

describe("POST /api/teams — duplicate name", () => {
  beforeEach(asAdmin);

  it("returns 409 when team name already exists", async () => {
    mockDb.team.findFirst.mockResolvedValue({ id: "t1", name: "Engineering" } as any);

    const res = await POST(buildPOST({ name: "Engineering" }), { params: {} as any });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/already exists/i);
  });
});

// ═══════════════════════════════════════════════
// POST /api/teams — happy path
// ═══════════════════════════════════════════════

describe("POST /api/teams — happy path", () => {
  beforeEach(asAdmin);

  it("creates team and returns data", async () => {
    mockDb.team.findFirst.mockResolvedValue(null); // no duplicate
    mockDb.team.create.mockResolvedValue({ id: "t-new", name: "Marketing" } as any);

    const res = await POST(buildPOST({ name: "Marketing" }), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Marketing");
  });

  it("scopes creation to tenant", async () => {
    mockDb.team.findFirst.mockResolvedValue(null);
    mockDb.team.create.mockResolvedValue({ id: "t-new", name: "Ops" } as any);

    await POST(buildPOST({ name: "Ops" }), { params: {} as any });

    const call = mockDb.team.create.mock.calls[0]?.[0] as any;
    expect(call.data.tenantId).toBe(TENANT);
    expect(call.data.name).toBe("Ops");
  });
});
