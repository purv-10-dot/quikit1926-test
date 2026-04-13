import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/members/route";

const USER = "user-admin-001";
const TENANT = "tenant-admin-001";

function buildGET(): NextRequest {
  return new NextRequest("http://localhost/api/members");
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/members", {
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
// GET /api/members — auth
// ═══════════════════════════════════════════════

describe("GET /api/members — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// GET /api/members — happy path
// ═══════════════════════════════════════════════

describe("GET /api/members — happy path", () => {
  beforeEach(asAdmin);

  it("returns members with team names", async () => {
    mockDb.membership.findMany.mockResolvedValue([
      {
        id: "m1",
        userId: "u1",
        tenantId: TENANT,
        role: "admin",
        status: "active",
        invitedAt: new Date(),
        acceptedAt: new Date(),
        createdAt: new Date(),
        user: {
          id: "u1",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@test.com",
          avatar: null,
          lastSignInAt: new Date(),
        },
      },
    ] as any);

    mockDb.userTeam.findMany.mockResolvedValue([
      { team: { name: "Engineering" } },
    ] as any);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].firstName).toBe("Jane");
    expect(body.data[0].teamNames).toEqual(["Engineering"]);
  });

  it("returns empty array when no members", async () => {
    mockDb.membership.findMany.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════
// POST /api/members — auth
// ═══════════════════════════════════════════════

describe("POST /api/members — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ email: "x@y.com", firstName: "A", lastName: "B", role: "member" }));
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════
// POST /api/members — validation
// ═══════════════════════════════════════════════

describe("POST /api/members — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when email missing", async () => {
    const res = await POST(buildPOST({ firstName: "A", lastName: "B", role: "member" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  it("returns 400 when firstName missing", async () => {
    const res = await POST(buildPOST({ email: "x@y.com", lastName: "B", role: "member" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when role missing", async () => {
    const res = await POST(buildPOST({ email: "x@y.com", firstName: "A", lastName: "B" }));
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/members — duplicate detection
// ═══════════════════════════════════════════════

describe("POST /api/members — duplicate detection", () => {
  beforeEach(asAdmin);

  it("returns 409 when user is already active", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "u1", email: "jane@test.com" } as any);
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m1", status: "active", tenantId: TENANT, userId: "u1",
    } as any);

    const res = await POST(buildPOST({
      email: "jane@test.com", firstName: "Jane", lastName: "Doe", role: "member",
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already an active member");
  });

  it("returns 409 when user has pending invitation", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "u1", email: "jane@test.com" } as any);
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m1", status: "invited", tenantId: TENANT, userId: "u1",
    } as any);

    const res = await POST(buildPOST({
      email: "jane@test.com", firstName: "Jane", lastName: "Doe", role: "member",
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("pending invitation");
  });
});

// ═══════════════════════════════════════════════
// POST /api/members — happy path (new user)
// ═══════════════════════════════════════════════

describe("POST /api/members — happy path", () => {
  beforeEach(asAdmin);

  it("creates new user and sends invitation", async () => {
    mockDb.user.findUnique.mockResolvedValueOnce(null); // user doesn't exist
    mockDb.user.create.mockResolvedValue({
      id: "u-new", email: "new@test.com", firstName: "New", lastName: "User",
    } as any);
    mockDb.membership.upsert.mockResolvedValue({} as any);
    mockDb.tenant.findUnique.mockResolvedValue({ name: "TestOrg" } as any);
    mockDb.user.findUnique.mockResolvedValue({ firstName: "Admin", lastName: "User" } as any);

    const res = await POST(buildPOST({
      email: "new@test.com", firstName: "New", lastName: "User", role: "member",
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("new@test.com");
    expect(mockDb.user.create).toHaveBeenCalledOnce();
    expect(mockDb.membership.upsert).toHaveBeenCalledOnce();
  });

  it("invites existing user without creating new account", async () => {
    mockDb.user.findUnique.mockResolvedValueOnce({ id: "u-existing", email: "existing@test.com" } as any);
    mockDb.membership.findUnique.mockResolvedValue(null); // no existing membership
    mockDb.membership.upsert.mockResolvedValue({} as any);
    mockDb.tenant.findUnique.mockResolvedValue({ name: "TestOrg" } as any);
    mockDb.user.findUnique.mockResolvedValue({ firstName: "Admin", lastName: "User" } as any);

    const res = await POST(buildPOST({
      email: "existing@test.com", firstName: "E", lastName: "U", role: "admin",
    }));

    expect(res.status).toBe(200);
    expect(mockDb.user.create).not.toHaveBeenCalled();
    expect(mockDb.membership.upsert).toHaveBeenCalledOnce();
  });
});
