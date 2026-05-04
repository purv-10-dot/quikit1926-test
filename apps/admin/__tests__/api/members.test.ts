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
  setSession({ id: USER, orgId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
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
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);

    const res = await GET(buildRequest("GET", "/api/members"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "employee" });
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      orgId: TENANT,
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
        orgId: TENANT,
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

  it("filters by orgId (tenant isolation)", async () => {
    asAuthedAdmin();

    mockDb.membership.findMany.mockResolvedValue([]);
    mockDb.membership.count.mockResolvedValue(0);

    await GET(buildRequest("GET", "/api/members"));

    const findManyCall = mockDb.membership.findMany.mock.calls[0]?.[0] as any;
    expect(findManyCall.where.orgId).toBe(TENANT);

    const countCall = mockDb.membership.count.mock.calls[0]?.[0] as any;
    expect(countCall.where.orgId).toBe(TENANT);
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

  it("returns generic 200 (no leak) when user is already an active member, and writes DUPLICATE_INVITE audit", async () => {
    asAuthedAdmin();

    mockDb.tenant.findUnique.mockResolvedValue({
      id: TENANT,
      name: "Acme",
      logoUrl: null,
      brandColor: null,
      allowedEmailDomains: [],
    } as any);
    mockDb.user.findUnique.mockResolvedValue({ id: "u2", email: "existing@test.com" } as any);
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m2",
      orgId: TENANT,
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
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("existing@test.com");
    expect(mockDb.membership.upsert).not.toHaveBeenCalled();
    expect(mockDb.user.create).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DUPLICATE_INVITE",
          entityType: "Membership",
          entityId: "m2",
          reason: "status=active",
        }),
      })
    );
  });

  it("returns generic 200 (no leak) when user has a pending invite, and writes DUPLICATE_INVITE audit", async () => {
    asAuthedAdmin();

    mockDb.tenant.findUnique.mockResolvedValue({
      id: TENANT,
      name: "Acme",
      logoUrl: null,
      brandColor: null,
      allowedEmailDomains: [],
    } as any);
    mockDb.user.findUnique.mockResolvedValue({ id: "u2", email: "pending@test.com" } as any);
    mockDb.membership.findUnique.mockResolvedValue({
      id: "m2",
      orgId: TENANT,
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
    expect(res.status).toBe(200);
    expect(mockDb.membership.upsert).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DUPLICATE_INVITE",
          reason: "status=invited",
        }),
      })
    );
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

  it("rejects email outside the tenant allowlist with 422", async () => {
    asAuthedAdmin();

    mockDb.tenant.findUnique.mockResolvedValue({
      id: TENANT,
      name: "Acme Corp",
      logoUrl: null,
      brandColor: null,
      allowedEmailDomains: ["acme.com"],
    } as any);

    const res = await POST(
      buildRequest("POST", "/api/members", {
        email: "outsider@yahoo.com",
        firstName: "Out",
        lastName: "Sider",
        role: "employee",
      })
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/domain not allowed/i);
    expect(mockDb.user.create).not.toHaveBeenCalled();
    expect(mockDb.membership.upsert).not.toHaveBeenCalled();
  });

  it("accepts email matching the tenant allowlist (case-insensitive)", async () => {
    asAuthedAdmin();

    mockDb.tenant.findUnique.mockResolvedValue({
      id: TENANT,
      name: "Acme Corp",
      logoUrl: null,
      brandColor: null,
      allowedEmailDomains: ["acme.com"],
    } as any);
    mockDb.user.findUnique.mockResolvedValueOnce(null);
    mockDb.user.create.mockResolvedValue({ id: "u-ok", email: "ok@ACME.com" } as any);
    mockDb.membership.upsert.mockResolvedValue({ id: "m-ok" } as any);
    mockDb.user.findUnique.mockResolvedValue({
      id: USER,
      firstName: "Admin",
      lastName: "User",
    } as any);

    const res = await POST(
      buildRequest("POST", "/api/members", {
        email: "ok@ACME.com",
        firstName: "OK",
        lastName: "User",
        role: "employee",
      })
    );
    expect(res.status).toBe(200);
  });

  it("writes an INVITED audit log on successful invite", async () => {
    asAuthedAdmin();

    mockDb.tenant.findUnique.mockResolvedValue({
      id: TENANT,
      name: "Acme Corp",
      logoUrl: null,
      brandColor: null,
      allowedEmailDomains: [],
    } as any);
    mockDb.user.findUnique.mockResolvedValueOnce(null);
    mockDb.user.create.mockResolvedValue({
      id: "u-audit",
      email: "audit@test.com",
    } as any);
    mockDb.membership.upsert.mockResolvedValue({ id: "m-audit" } as any);
    mockDb.user.findUnique.mockResolvedValue({
      id: USER,
      firstName: "Admin",
      lastName: "User",
    } as any);

    const res = await POST(
      buildRequest("POST", "/api/members", {
        email: "audit@test.com",
        firstName: "Audit",
        lastName: "User",
        role: "employee",
      })
    );
    expect(res.status).toBe(200);
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "INVITED",
          entityType: "Membership",
          entityId: "m-audit",
          orgId: TENANT,
          actorId: USER,
        }),
      })
    );
  });
});
