import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

// Mock email sending at top level (hoisted by vitest)
vi.mock("@/lib/email", () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { GET, POST } from "@/app/api/members/route";

const USER = "user-admin-001";
const TENANT = "tenant-001";

function buildRequest(method: string, url: string, body?: object): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(`http://localhost${url}`, init as never);
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

// ---------------------------------------------------------------------------
// GET /api/members
// ---------------------------------------------------------------------------
describe("GET /api/members", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildRequest("GET", "/api/members"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when user has no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);

    const res = await GET(buildRequest("GET", "/api/members"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not admin", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "employee" });
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      role: "employee",
      status: "active",
    } as any);

    const res = await GET(buildRequest("GET", "/api/members"));
    expect(res.status).toBe(403);
  });

  it("returns member list for admin (happy path)", async () => {
    asAuthedAdmin();

    const now = new Date();
    mockDb.membership.findMany.mockResolvedValue([
      {
        id: "m2",
        userId: "u2",
        tenantId: TENANT,
        role: "employee",
        status: "active",
        invitedAt: now,
        acceptedAt: now,
        user: {
          id: "u2",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@test.com",
          avatar: null,
          lastSignInAt: now,
          userTeams: [{ team: { name: "Engineering" } }],
        },
      },
    ] as any);
    mockDb.membership.count.mockResolvedValue(1);

    const res = await GET(buildRequest("GET", "/api/members"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBe("jane@test.com");
    expect(body.data[0].teamNames).toEqual(["Engineering"]);
    expect(body.meta.total).toBe(1);
  });

  it("filters by tenantId (tenant isolation)", async () => {
    asAuthedAdmin();

    mockDb.membership.findMany.mockResolvedValue([]);
    mockDb.membership.count.mockResolvedValue(0);

    await GET(buildRequest("GET", "/api/members"));

    const findManyCall = mockDb.membership.findMany.mock.calls[0]?.[0] as any;
    expect(findManyCall.where.tenantId).toBe(TENANT);

    const countCall = mockDb.membership.count.mock.calls[0]?.[0] as any;
    expect(countCall.where.tenantId).toBe(TENANT);
  });

  it("respects pagination params", async () => {
    asAuthedAdmin();

    mockDb.membership.findMany.mockResolvedValue([]);
    mockDb.membership.count.mockResolvedValue(42);

    const res = await GET(buildRequest("GET", "/api/members?page=3&limit=10"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.page).toBe(3);
    expect(body.meta.limit).toBe(10);

    const call = mockDb.membership.findMany.mock.calls[0]?.[0] as any;
    expect(call.skip).toBe(20); // (3-1) * 10
    expect(call.take).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// POST /api/members
// ---------------------------------------------------------------------------
describe("POST /api/members", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest("POST", "/api/members", {
        email: "new@test.com",
        firstName: "New",
        lastName: "User",
        role: "employee",
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input (missing email)", async () => {
    asAuthedAdmin();

    const res = await POST(
      buildRequest("POST", "/api/members", {
        firstName: "New",
        lastName: "User",
        role: "employee",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid role", async () => {
    asAuthedAdmin();

    const res = await POST(
      buildRequest("POST", "/api/members", {
        email: "new@test.com",
        firstName: "New",
        lastName: "User",
        role: "invalid_role",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when user is already an active member", async () => {
    asAuthedAdmin();

    mockDb.user.findUnique.mockResolvedValue({ id: "u2", email: "existing@test.com" } as any);
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m2",
      tenantId: TENANT,
      userId: "u2",
      status: "active",
    } as any);

    const res = await POST(
      buildRequest("POST", "/api/members", {
        email: "existing@test.com",
        firstName: "Existing",
        lastName: "User",
        role: "employee",
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already an active member");
  });

  it("returns 409 when user already has a pending invitation", async () => {
    asAuthedAdmin();

    mockDb.user.findUnique.mockResolvedValue({ id: "u2", email: "pending@test.com" } as any);
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m2",
      tenantId: TENANT,
      userId: "u2",
      status: "invited",
    } as any);

    const res = await POST(
      buildRequest("POST", "/api/members", {
        email: "pending@test.com",
        firstName: "Pending",
        lastName: "User",
        role: "employee",
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("pending invitation");
  });

  it("creates invitation for new user (happy path)", async () => {
    asAuthedAdmin();

    // User doesn't exist yet
    mockDb.user.findUnique.mockResolvedValueOnce(null);
    // Create user
    mockDb.user.create.mockResolvedValue({
      id: "u-new",
      email: "new@test.com",
      firstName: "New",
      lastName: "User",
    } as any);
    // Upsert membership
    mockDb.membership.upsert.mockResolvedValue({ id: "m-new" } as any);
    // Tenant + inviter lookup
    mockDb.tenant.findUnique.mockResolvedValue({ id: TENANT, name: "Acme Corp" } as any);
    mockDb.user.findUnique.mockResolvedValue({
      id: USER,
      firstName: "Admin",
      lastName: "User",
    } as any);

    const res = await POST(
      buildRequest("POST", "/api/members", {
        email: "new@test.com",
        firstName: "New",
        lastName: "User",
        role: "employee",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("new@test.com");
  });
});
