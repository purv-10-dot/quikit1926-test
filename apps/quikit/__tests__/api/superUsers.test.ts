import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/super/users/route";

const SUPER_ADMIN = "sa-001";

function buildGET(params = ""): NextRequest {
  return new NextRequest(`http://localhost/api/super/users${params ? "?" + params : ""}`);
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/super/users", {
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
// GET /api/super/users — auth
// ═══════════════════════════════════════════════

describe("GET /api/super/users — auth", () => {
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
// GET /api/super/users — happy path
// ═══════════════════════════════════════════════

describe("GET /api/super/users — happy path", () => {
  beforeEach(asSuperAdmin);

  it("returns paginated users with membership count", async () => {
    mockDb.user.findMany.mockResolvedValue([
      {
        id: "u1", email: "a@b.com", firstName: "A", lastName: "B",
        isSuperAdmin: false, lastSignInAt: new Date("2026-04-01"),
        _count: { memberships: 2 },
      },
    ] as any);
    mockDb.user.count.mockResolvedValue(1);

    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].membershipCount).toBe(2);
  });

  it("supports search parameter", async () => {
    mockDb.user.findMany.mockResolvedValue([]);
    mockDb.user.count.mockResolvedValue(0);

    await GET(buildGET("search=john"));

    expect(mockDb.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ firstName: expect.objectContaining({ contains: "john" }) }),
          ]),
        }),
      })
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/super/users — auth
// ═══════════════════════════════════════════════

describe("POST /api/super/users — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ email: "x@y.com", firstName: "A", lastName: "B", password: "pass1234" }));
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════
// POST /api/super/users — validation
// ═══════════════════════════════════════════════

describe("POST /api/super/users — validation", () => {
  beforeEach(asSuperAdmin);

  it("returns 400 when email is missing", async () => {
    const res = await POST(buildPOST({ firstName: "A", lastName: "B", password: "pass1234" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(buildPOST({ email: "x@y.com", firstName: "A", lastName: "B" }));
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/super/users — happy path
// ═══════════════════════════════════════════════

describe("POST /api/super/users — happy path", () => {
  beforeEach(asSuperAdmin);

  it("creates a new user", async () => {
    mockDb.user.findUnique
      .mockResolvedValueOnce({ id: SUPER_ADMIN, isSuperAdmin: true } as any) // auth check
      .mockResolvedValueOnce(null); // no existing user with email
    mockDb.user.create.mockResolvedValue({
      id: "u-new", email: "new@test.com", firstName: "New", lastName: "User",
      isSuperAdmin: false,
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await POST(buildPOST({
      email: "new@test.com", firstName: "New", lastName: "User", password: "pass1234",
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockDb.user.create).toHaveBeenCalledOnce();
  });
});
