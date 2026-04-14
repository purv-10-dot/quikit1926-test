import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/kpi/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-1";

function buildRequest(qs: string = ""): NextRequest {
  return new NextRequest(`http://localhost/api/kpi${qs}`, { method: "GET" });
}

function asAuthedAdmin() {
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

describe("GET /api/kpi — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await GET(buildRequest(), { params: {} } as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET(buildRequest(), { params: {} } as any);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/kpi — happy path", () => {
  beforeEach(asAuthedAdmin);

  it("returns empty list with total=0 for a new tenant", async () => {
    mockDb.kPI.count.mockResolvedValue(0);
    mockDb.kPI.findMany.mockResolvedValue([]);
    mockDb.user.findMany.mockResolvedValue([]);

    const res = await GET(buildRequest(), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(0);
    expect(body.data.kpis).toEqual([]);
  });

  it("filters by tenantId on every query", async () => {
    mockDb.kPI.count.mockResolvedValue(0);
    mockDb.kPI.findMany.mockResolvedValue([]);
    mockDb.user.findMany.mockResolvedValue([]);

    await GET(buildRequest(), { params: {} } as any);

    const findManyCall = mockDb.kPI.findMany.mock.calls[0]?.[0] as any;
    expect(findManyCall.where.tenantId).toBe(TENANT);

    const countCall = mockDb.kPI.count.mock.calls[0]?.[0] as any;
    expect(countCall.where.tenantId).toBe(TENANT);
  });

  it("respects pagination query params", async () => {
    mockDb.kPI.count.mockResolvedValue(42);
    mockDb.kPI.findMany.mockResolvedValue([]);
    mockDb.user.findMany.mockResolvedValue([]);

    const res = await GET(buildRequest("?page=3&pageSize=5"), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.page).toBe(3);
    expect(body.data.pageSize).toBe(5);

    const call = mockDb.kPI.findMany.mock.calls[0]?.[0] as any;
    expect(call.skip).toBe(10); // (3-1) * 5
    expect(call.take).toBe(5);
  });

  it("passes kpiLevel filter through to where clause", async () => {
    mockDb.kPI.count.mockResolvedValue(0);
    mockDb.kPI.findMany.mockResolvedValue([]);
    mockDb.user.findMany.mockResolvedValue([]);

    await GET(buildRequest("?kpiLevel=team"), { params: {} } as any);

    const call = mockDb.kPI.findMany.mock.calls[0]?.[0] as any;
    expect(call.where.kpiLevel).toBe("team");
  });

  it("queries KPIs scoped to tenant (soft delete handled by middleware)", async () => {
    mockDb.kPI.count.mockResolvedValue(0);
    mockDb.kPI.findMany.mockResolvedValue([]);
    mockDb.user.findMany.mockResolvedValue([]);

    await GET(buildRequest(), { params: {} } as any);

    const call = mockDb.kPI.findMany.mock.calls[0]?.[0] as any;
    expect(call.where.tenantId).toBe(TENANT);
    // deletedAt filtering is handled by the Prisma soft-delete middleware
    // in packages/database/index.ts — not in the route handler
  });
});
