import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/super/apps/route";

const SUPER_ADMIN = "sa-001";

function buildGET(params = ""): NextRequest {
  return new NextRequest(`http://localhost/api/super/apps${params ? "?" + params : ""}`);
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/super/apps", {
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

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/super/apps — auth
// ═══════════════════════════════════════════════

describe("GET /api/super/apps — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession({ id: "regular", tenantId: "t1", role: "member" });
    mockDb.user.findUnique.mockResolvedValue({ id: "regular", isSuperAdmin: false } as any);
    const res = await GET(buildGET());
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// GET /api/super/apps — happy path
// ═══════════════════════════════════════════════

describe("GET /api/super/apps — happy path", () => {
  beforeEach(asSuperAdmin);

  it("returns paginated apps", async () => {
    mockDb.app.findMany.mockResolvedValue([
      {
        id: "a1", name: "QuikScale", slug: "quikscale", description: "OKR tool",
        baseUrl: "http://localhost:3004", status: "active",
        createdAt: new Date(), _count: { appAccess: 42 },
      },
    ] as any);
    mockDb.app.count.mockResolvedValue(1);

    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("QuikScale");
  });
});

// ═══════════════════════════════════════════════
// POST /api/super/apps — auth
// ═══════════════════════════════════════════════

describe("POST /api/super/apps — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ name: "Test", slug: "test", baseUrl: "http://localhost" }));
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════
// POST /api/super/apps — validation
// ═══════════════════════════════════════════════

describe("POST /api/super/apps — validation", () => {
  beforeEach(asSuperAdmin);

  it("returns 400 when name missing", async () => {
    const res = await POST(buildPOST({ slug: "test", baseUrl: "http://localhost" }));
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/super/apps — happy path
// ═══════════════════════════════════════════════

describe("POST /api/super/apps — happy path", () => {
  beforeEach(asSuperAdmin);

  it("creates a new app", async () => {
    mockDb.app.findFirst.mockResolvedValue(null); // no duplicate slug
    mockDb.app.create.mockResolvedValue({
      id: "a-new", name: "New App", slug: "new-app",
      baseUrl: "http://localhost:4000", status: "active",
      createdAt: new Date(),
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await POST(buildPOST({
      name: "New App", slug: "new-app", baseUrl: "http://localhost:4000",
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
