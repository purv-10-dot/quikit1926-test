import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

// Mock fire-and-forget audit logging
vi.mock("@/lib/auditLog", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendUserCreatedEmail: vi.fn().mockResolvedValue(undefined),
  sendOrgSuspendedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "@/app/api/super/orgs/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/super/orgs", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 when there is no session", async () => {
    setSession(null);
    const res = await GET(makeRequest("http://localhost:3006/api/super/orgs"));
    expect(res.status).toBe(401);
    const body = await bodyOf(res);
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 403 when user is not a super admin", async () => {
    setSession(REGULAR_USER);
    const res = await GET(makeRequest("http://localhost:3006/api/super/orgs"));
    expect(res.status).toBe(403);
    const body = await bodyOf(res);
    expect(body).toEqual({ success: false, error: "Super admin access required" });
  });

  it("returns org list on success", async () => {
    setSession(SUPER_ADMIN);

    const now = new Date();
    const mockTenants = [
      {
        id: "t-1",
        name: "Acme",
        slug: "acme",
        plan: "startup",
        status: "active",
        createdAt: now,
        _count: { users: 5 },
      },
    ];

    mockDb.tenant.findMany.mockResolvedValue(mockTenants as never);
    mockDb.tenant.count.mockResolvedValue(1 as never);

    const res = await GET(makeRequest("http://localhost:3006/api/super/orgs"));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "t-1",
      name: "Acme",
      slug: "acme",
      memberCount: 5,
    });
    expect(body.pagination).toBeDefined();
  });
});

describe("POST /api/super/orgs", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 when there is no session", async () => {
    setSession(null);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "Test", slug: "test" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a super admin", async () => {
    setSession(REGULAR_USER);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "Test", slug: "test" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid input (empty name)", async () => {
    setSession(SUPER_ADMIN);
    const res = await POST(
      makeRequest("http://localhost:3006/api/super/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "", slug: "test" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.success).toBe(false);
  });

  it("returns 409 when slug already exists", async () => {
    setSession(SUPER_ADMIN);
    mockDb.tenant.findUnique.mockResolvedValue({ id: "existing" } as never);

    const res = await POST(
      makeRequest("http://localhost:3006/api/super/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "Acme", slug: "acme" }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await bodyOf(res);
    expect(body.error).toContain("slug already exists");
  });

  it("creates org and returns 201 on success", async () => {
    setSession(SUPER_ADMIN);
    mockDb.tenant.findUnique.mockResolvedValue(null as never);

    const createdTenant = {
      id: "t-new",
      name: "NewOrg",
      slug: "new-org",
      plan: "startup",
      status: "active",
      createdAt: new Date(),
    };
    mockDb.tenant.create.mockResolvedValue(createdTenant as never);

    const res = await POST(
      makeRequest("http://localhost:3006/api/super/orgs", {
        method: "POST",
        body: JSON.stringify({ name: "NewOrg", slug: "new-org" }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("t-new");
  });
});
