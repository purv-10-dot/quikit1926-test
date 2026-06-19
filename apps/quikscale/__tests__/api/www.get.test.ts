import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/www/[id]/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-www-get-1";
const WWW_ID = "ckwww0000000000000000000001";

function buildRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/www/${WWW_ID}`, { method: "GET" });
}

function asAuthedAdmin() {
  setSession({ id: USER, orgId: TENANT, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    orgId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

function makeWWWItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: WWW_ID,
    orgId: TENANT,
    who: USER,
    what: "Ship the pricing page",
    when: new Date("2026-04-15T00:00:00.000Z"),
    linkedPriorityId: null,
    linkedKPIId: null,
    status: "not-yet-started",
    notes: null,
    category: null,
    originalDueDate: new Date("2026-04-10T00:00:00.000Z"),
    revisedDates: [],
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
    createdBy: USER,
    updatedBy: null,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/www/[id] — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildRequest(), { params: { id: WWW_ID } } as any);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/www/[id] — tenant isolation", () => {
  beforeEach(asAuthedAdmin);

  it("returns 404 when WWW item is in a different org (findFirst filters by orgId, so it returns null)", async () => {
    // The route uses findFirst({ where: { id, orgId } }) — cross-tenant gives null → 404.
    mockDb.wWWItem.findFirst.mockResolvedValue(null);

    const res = await GET(buildRequest(), { params: { id: WWW_ID } } as any);
    expect(res.status).toBe(404);

    // Verify the WHERE clause includes our tenant id (defense-in-depth assertion).
    const call = mockDb.wWWItem.findFirst.mock.calls[0]?.[0] as any;
    expect(call.where.id).toBe(WWW_ID);
    expect(call.where.orgId).toBe(TENANT);
  });
});

describe("GET /api/www/[id] — happy path (human user / cookie session)", () => {
  beforeEach(asAuthedAdmin);

  it("returns item with email PRESENT in who_user / who_users (actingAs='user')", async () => {
    mockDb.wWWItem.findFirst.mockResolvedValue(makeWWWItem() as any);
    mockDb.user.findMany.mockResolvedValue([
      { id: USER, firstName: "Test", lastName: "User", email: "test@example.com" },
    ] as any);

    const res = await GET(buildRequest(), { params: { id: WWW_ID } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(WWW_ID);

    // Human caller sees email — agent-call stripping is covered separately in
    // withOrgAuth-bearer.test.ts.
    expect(body.data.who_user.email).toBe("test@example.com");
    expect(body.data.who_users[0].email).toBe("test@example.com");

    // url field present (parity with KPI/Priority summary endpoints).
    expect(body.data.url).toBe(`/quikscale/www/${WWW_ID}`);
  });

  it("serializes DateTime fields to ISO strings", async () => {
    mockDb.wWWItem.findFirst.mockResolvedValue(makeWWWItem() as any);
    mockDb.user.findMany.mockResolvedValue([
      { id: USER, firstName: "Test", lastName: "User", email: "test@example.com" },
    ] as any);

    const res = await GET(buildRequest(), { params: { id: WWW_ID } } as any);
    const body = await res.json();

    expect(typeof body.data.when).toBe("string");
    expect(body.data.when).toBe("2026-04-15T00:00:00.000Z");
    expect(typeof body.data.createdAt).toBe("string");
    expect(typeof body.data.updatedAt).toBe("string");
    expect(typeof body.data.originalDueDate).toBe("string");
    expect(body.data.originalDueDate).toBe("2026-04-10T00:00:00.000Z");
  });

  it("returns 404 when WWW item not found", async () => {
    mockDb.wWWItem.findFirst.mockResolvedValue(null);
    const res = await GET(buildRequest(), { params: { id: WWW_ID } } as any);
    expect(res.status).toBe(404);
  });
});
