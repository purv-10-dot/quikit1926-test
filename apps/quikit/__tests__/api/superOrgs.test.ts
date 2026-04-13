import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/super/orgs/route";

const SUPER_ADMIN = "sa-001";

function buildGET(params = ""): NextRequest {
  return new NextRequest(`http://localhost/api/super/orgs${params ? "?" + params : ""}`);
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/super/orgs", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function asSuperAdmin() {
  setSession({ id: SUPER_ADMIN, tenantId: "any", role: "super_admin" });
  mockDb.user.findUnique.mockResolvedValue({
    id: SUPER_ADMIN,
    isSuperAdmin: true,
  } as any);
}

function asRegularUser() {
  setSession({ id: "regular-user", tenantId: "t1", role: "member" });
  mockDb.user.findUnique.mockResolvedValue({
    id: "regular-user",
    isSuperAdmin: false,
  } as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/super/orgs — auth
// ═══════════════════════════════════════════════

describe("GET /api/super/orgs — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when not a super admin", async () => {
    asRegularUser();
    const res = await GET(buildGET());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Super admin");
  });
});

// ═══════════════════════════════════════════════
// GET /api/super/orgs — happy path
// ═══════════════════════════════════════════════

describe("GET /api/super/orgs — happy path", () => {
  beforeEach(asSuperAdmin);

  it("returns paginated tenants", async () => {
    const mockTenants = [
      {
        id: "t1",
        name: "Org One",
        slug: "org-one",
        plan: "pro",
        status: "active",
        createdAt: new Date("2026-01-01"),
        _count: { users: 25 },
      },
    ];

    mockDb.tenant.findMany.mockResolvedValue(mockTenants as any);
    mockDb.tenant.count.mockResolvedValue(1);

    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Org One");
    expect(body.data[0].memberCount).toBe(25);
  });

  it("passes search param to query", async () => {
    mockDb.tenant.findMany.mockResolvedValue([]);
    mockDb.tenant.count.mockResolvedValue(0);

    await GET(buildGET("search=test"));

    expect(mockDb.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ name: expect.objectContaining({ contains: "test" }) }),
          ]),
        }),
      })
    );
  });

  it("returns empty when no tenants", async () => {
    mockDb.tenant.findMany.mockResolvedValue([]);
    mockDb.tenant.count.mockResolvedValue(0);

    const res = await GET(buildGET());
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════
// POST /api/super/orgs — auth
// ═══════════════════════════════════════════════

describe("POST /api/super/orgs — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ name: "Test", slug: "test" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not super admin", async () => {
    asRegularUser();
    const res = await POST(buildPOST({ name: "Test", slug: "test" }));
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// POST /api/super/orgs — validation
// ═══════════════════════════════════════════════

describe("POST /api/super/orgs — validation", () => {
  beforeEach(asSuperAdmin);

  it("returns 400 when name missing", async () => {
    const res = await POST(buildPOST({ slug: "test" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when slug missing", async () => {
    const res = await POST(buildPOST({ name: "Test" }));
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/super/orgs — happy path
// ═══════════════════════════════════════════════

describe("POST /api/super/orgs — happy path", () => {
  beforeEach(asSuperAdmin);

  it("creates a new tenant", async () => {
    mockDb.tenant.findFirst.mockResolvedValue(null); // no duplicate slug
    mockDb.tenant.create.mockResolvedValue({
      id: "t-new",
      name: "New Org",
      slug: "new-org",
      plan: "free",
      status: "active",
      createdAt: new Date(),
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await POST(buildPOST({ name: "New Org", slug: "new-org" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockDb.tenant.create).toHaveBeenCalledOnce();
  });
});
