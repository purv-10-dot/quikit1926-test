import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/users/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-users-1";

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/users${qs ? "?" + qs : ""}`, { method: "GET" });
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
// GET /api/users — auth
// ═══════════════════════════════════════════════

describe("GET /api/users — auth", () => {
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
// GET /api/users — happy path
// ═══════════════════════════════════════════════

describe("GET /api/users — happy path", () => {
  beforeEach(asAdmin);

  it("returns paginated users for tenant", async () => {
    const members = [
      { user: { id: "u1", firstName: "Alice", lastName: "A", email: "a@test.com" } },
      { user: { id: "u2", firstName: "Bob", lastName: "B", email: "b@test.com" } },
    ];
    mockDb.membership.findMany.mockResolvedValue(members as any);
    mockDb.membership.count.mockResolvedValue(2);

    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].firstName).toBe("Alice");
    expect(body.meta.total).toBe(2);
  });

  it("filters by tenantId and active status", async () => {
    mockDb.membership.findMany.mockResolvedValue([]);
    mockDb.membership.count.mockResolvedValue(0);

    await GET(buildGET(), { params: {} as any });

    const call = mockDb.membership.findMany.mock.calls[0]?.[0] as any;
    expect(call.where.tenantId).toBe(TENANT);
    expect(call.where.status).toBe("active");
  });

  it("filters by teamId when provided", async () => {
    mockDb.membership.findMany.mockResolvedValue([]);
    mockDb.membership.count.mockResolvedValue(0);

    await GET(buildGET("teamId=team-123"), { params: {} as any });

    const call = mockDb.membership.findMany.mock.calls[0]?.[0] as any;
    expect(call.where.teamId).toBe("team-123");
  });
});
