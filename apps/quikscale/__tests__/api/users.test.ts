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
  setSession({ id: USER, orgId: TENANT, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    orgId: TENANT,
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
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue(null);
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
    mockDb.orgMember.findMany.mockResolvedValue(members as any);
    mockDb.orgMember.count.mockResolvedValue(2);

    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].firstName).toBe("Alice");
    expect(body.meta.total).toBe(2);
  });

  it("filters by orgId and active status", async () => {
    mockDb.orgMember.findMany.mockResolvedValue([]);
    mockDb.orgMember.count.mockResolvedValue(0);

    await GET(buildGET(), { params: {} as any });

    const call = mockDb.orgMember.findMany.mock.calls[0]?.[0] as any;
    expect(call.where.orgId).toBe(TENANT);
    expect(call.where.status).toBe("active");
  });

  it("filters by teamId when provided", async () => {
    mockDb.orgMember.findMany.mockResolvedValue([]);
    mockDb.orgMember.count.mockResolvedValue(0);

    await GET(buildGET("teamId=team-123"), { params: {} as any });

    const call = mockDb.orgMember.findMany.mock.calls[0]?.[0] as any;
    expect(call.where.teamId).toBe("team-123");
  });

  // Regression: the owner picker used to search only the already-loaded page,
  // so members past page 1 returned "No results". Search is now server-side.
  it("applies a case-insensitive name/email search across the joined user", async () => {
    mockDb.orgMember.findMany.mockResolvedValue([]);
    mockDb.orgMember.count.mockResolvedValue(0);

    await GET(buildGET("search=Himanshu"), { params: {} as any });

    const call = mockDb.orgMember.findMany.mock.calls[0]?.[0] as any;
    expect(call.where.user.AND).toHaveLength(1);
    expect(call.where.user.AND[0].OR).toEqual([
      { firstName: { contains: "Himanshu", mode: "insensitive" } },
      { lastName: { contains: "Himanshu", mode: "insensitive" } },
      { email: { contains: "Himanshu", mode: "insensitive" } },
    ]);
  });

  it("splits a multi-word search into AND-ed tokens (firstName + lastName)", async () => {
    mockDb.orgMember.findMany.mockResolvedValue([]);
    mockDb.orgMember.count.mockResolvedValue(0);

    await GET(buildGET("search=Himanshu%20Pandey"), { params: {} as any });

    const call = mockDb.orgMember.findMany.mock.calls[0]?.[0] as any;
    expect(call.where.user.AND).toHaveLength(2);
    expect(call.where.user.AND[0].OR[0]).toEqual({ firstName: { contains: "Himanshu", mode: "insensitive" } });
    expect(call.where.user.AND[1].OR[1]).toEqual({ lastName: { contains: "Pandey", mode: "insensitive" } });
  });

  it("omits the user search filter when search is empty/whitespace", async () => {
    mockDb.orgMember.findMany.mockResolvedValue([]);
    mockDb.orgMember.count.mockResolvedValue(0);

    await GET(buildGET("search=%20%20"), { params: {} as any });

    const call = mockDb.orgMember.findMany.mock.calls[0]?.[0] as any;
    expect(call.where.user).toBeUndefined();
  });
});
