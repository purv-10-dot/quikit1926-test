import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET, PATCH, DELETE } from "@/app/api/members/[id]/route";

const USER = "user-admin-001";
const TENANT = "tenant-001";
const MEMBER_ID = "membership-001";

function buildRequest(method: string, url: string, body?: object): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(`http://localhost${url}`, init as never);
}

const routeContext = { params: { id: MEMBER_ID } };

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
// GET /api/members/[id]
// ---------------------------------------------------------------------------
describe("GET /api/members/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(
      buildRequest("GET", `/api/members/${MEMBER_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when member not in tenant (tenant isolation)", async () => {
    asAuthedAdmin();
    // First findFirst for requireAdmin already mocked in asAuthedAdmin
    // Second findFirst for the actual member lookup — return null
    mockDb.membership.findFirst
      .mockResolvedValueOnce({
        id: "m1",
        userId: USER,
        tenantId: TENANT,
        role: "admin",
        status: "active",
      } as any)
      .mockResolvedValueOnce(null);

    const res = await GET(
      buildRequest("GET", `/api/members/${MEMBER_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Member not found");
  });

  it("returns member detail (happy path)", async () => {
    asAuthedAdmin();

    const now = new Date();
    // Second findFirst for the actual member lookup
    mockDb.membership.findFirst
      .mockResolvedValueOnce({
        id: "m1",
        userId: USER,
        tenantId: TENANT,
        role: "admin",
        status: "active",
      } as any)
      .mockResolvedValueOnce({
        id: MEMBER_ID,
        userId: "u2",
        tenantId: TENANT,
        role: "employee",
        status: "active",
        customPermissions: {},
        invitedAt: now,
        acceptedAt: now,
        user: {
          id: "u2",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@test.com",
          avatar: null,
          lastSignInAt: now,
          createdAt: now,
        },
      } as any);

    mockDb.userTeam.findMany.mockResolvedValue([
      {
        team: { id: "t1", name: "Engineering", color: "#0066cc" },
      },
    ] as any);

    mockDb.userAppAccess.findMany.mockResolvedValue([
      {
        role: "user",
        app: { id: "a1", name: "QuikScale", slug: "quikscale", iconUrl: null },
      },
    ] as any);

    const res = await GET(
      buildRequest("GET", `/api/members/${MEMBER_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe("jane@test.com");
    expect(body.data.teams).toHaveLength(1);
    expect(body.data.apps).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/members/[id]
// ---------------------------------------------------------------------------
describe("PATCH /api/members/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await PATCH(
      buildRequest("PATCH", `/api/members/${MEMBER_ID}`, { role: "manager" }),
      routeContext as any
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when member not in tenant", async () => {
    asAuthedAdmin();
    mockDb.membership.findFirst
      .mockResolvedValueOnce({
        id: "m1",
        userId: USER,
        tenantId: TENANT,
        role: "admin",
        status: "active",
      } as any)
      .mockResolvedValueOnce(null);

    const res = await PATCH(
      buildRequest("PATCH", `/api/members/${MEMBER_ID}`, { role: "manager" }),
      routeContext as any
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid input", async () => {
    asAuthedAdmin();
    mockDb.membership.findFirst
      .mockResolvedValueOnce({
        id: "m1",
        userId: USER,
        tenantId: TENANT,
        role: "admin",
        status: "active",
      } as any)
      .mockResolvedValueOnce({
        id: MEMBER_ID,
        userId: "u2",
        tenantId: TENANT,
        role: "employee",
        status: "active",
      } as any);

    const res = await PATCH(
      buildRequest("PATCH", `/api/members/${MEMBER_ID}`, { role: "invalid_role" }),
      routeContext as any
    );
    expect(res.status).toBe(400);
  });

  it("updates member role (happy path)", async () => {
    asAuthedAdmin();
    mockDb.membership.findFirst
      .mockResolvedValueOnce({
        id: "m1",
        userId: USER,
        tenantId: TENANT,
        role: "admin",
        status: "active",
      } as any)
      .mockResolvedValueOnce({
        id: MEMBER_ID,
        userId: "u2",
        tenantId: TENANT,
        role: "employee",
        status: "active",
      } as any);

    mockDb.membership.update.mockResolvedValue({
      id: MEMBER_ID,
      role: "manager",
      status: "active",
    } as any);

    const res = await PATCH(
      buildRequest("PATCH", `/api/members/${MEMBER_ID}`, { role: "manager" }),
      routeContext as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.role).toBe("manager");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/members/[id]
// ---------------------------------------------------------------------------
describe("DELETE /api/members/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await DELETE(
      buildRequest("DELETE", `/api/members/${MEMBER_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when member not in tenant", async () => {
    asAuthedAdmin();
    mockDb.membership.findFirst
      .mockResolvedValueOnce({
        id: "m1",
        userId: USER,
        tenantId: TENANT,
        role: "admin",
        status: "active",
      } as any)
      .mockResolvedValueOnce(null);

    const res = await DELETE(
      buildRequest("DELETE", `/api/members/${MEMBER_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(404);
  });

  it("deactivates member (happy path)", async () => {
    asAuthedAdmin();
    mockDb.membership.findFirst
      .mockResolvedValueOnce({
        id: "m1",
        userId: USER,
        tenantId: TENANT,
        role: "admin",
        status: "active",
      } as any)
      .mockResolvedValueOnce({
        id: MEMBER_ID,
        userId: "u2",
        tenantId: TENANT,
        role: "employee",
        status: "active",
      } as any);

    mockDb.membership.update.mockResolvedValue({
      id: MEMBER_ID,
      status: "inactive",
    } as any);

    const res = await DELETE(
      buildRequest("DELETE", `/api/members/${MEMBER_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Member deactivated");

    // Verify it was a soft delete (status update, not hard delete)
    expect(mockDb.membership.update).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: { status: "inactive" },
    });
  });
});
