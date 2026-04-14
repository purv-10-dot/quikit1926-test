import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/org/teams/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-orgteam-1";

// ---- Helpers ----------------------------------------------------------------

function buildGET(params = ""): NextRequest {
  return new NextRequest(`http://localhost/api/org/teams${params ? "?" + params : ""}`);
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/org/teams", {
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

const validBody = {
  name: "Engineering",
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/org/teams — auth
// ═══════════════════════════════════════════════

describe("GET /api/org/teams — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET(), { params: {} } as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET(buildGET(), { params: {} } as any);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// GET /api/org/teams — happy path
// ═══════════════════════════════════════════════

describe("GET /api/org/teams — happy path", () => {
  beforeEach(asAdmin);

  it("returns teams with member count scoped to tenant", async () => {
    const mockTeam = {
      id: "t1",
      name: "Engineering",
      description: null,
      color: "#0066cc",
      headId: USER,
      members: [
        {
          userId: USER,
          user: { id: USER, firstName: "Test", lastName: "User", email: "test@test.com" },
        },
      ],
      createdAt: new Date(),
    };
    mockDb.team.findMany.mockResolvedValue([mockTeam] as any);
    mockDb.team.count.mockResolvedValue(1);
    mockDb.user.findMany.mockResolvedValue([
      { id: USER, firstName: "Test", lastName: "User" },
    ] as any);

    const res = await GET(buildGET(), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].memberCount).toBe(1);
    expect(body.data[0].headName).toBe("Test User");

    // Verify tenant isolation
    expect(mockDb.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/org/teams — auth
// ═══════════════════════════════════════════════

describe("POST /api/org/teams — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(validBody), { params: {} } as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST(validBody), { params: {} } as any);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// POST /api/org/teams — validation
// ═══════════════════════════════════════════════

describe("POST /api/org/teams — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when name is empty", async () => {
    const res = await POST(buildPOST({ name: "" }), { params: {} } as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when color hex is invalid", async () => {
    const res = await POST(buildPOST({ name: "Eng", color: "not-a-hex" }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/org/teams — duplicate name check
// ═══════════════════════════════════════════════

describe("POST /api/org/teams — duplicate name", () => {
  beforeEach(asAdmin);

  it("returns 409 when team name already exists in tenant", async () => {
    mockDb.team.findFirst.mockResolvedValue({
      id: "existing-t1",
      name: "Engineering",
      tenantId: TENANT,
    } as any);

    const res = await POST(buildPOST(validBody), { params: {} } as any);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/already exists/i);
  });
});

// ═══════════════════════════════════════════════
// POST /api/org/teams — happy path
// ═══════════════════════════════════════════════

describe("POST /api/org/teams — happy path", () => {
  beforeEach(asAdmin);

  it("creates a team with 201, generates slug, writes audit log", async () => {
    // No duplicate
    mockDb.team.findFirst.mockResolvedValue(null);
    const createdTeam = {
      id: "new-t1",
      name: "Engineering",
      description: null,
      color: "#0066cc",
      headId: null,
      slug: "engineering-abc123",
      createdAt: new Date(),
      createdBy: USER,
      tenantId: TENANT,
    };
    mockDb.team.create.mockResolvedValue(createdTeam as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await POST(buildPOST(validBody), { params: {} } as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("new-t1");
    expect(body.data.memberCount).toBe(0);

    // Verify slug was generated (contains base name in lowercase)
    const createArg = (mockDb.team.create as any).mock.calls[0][0];
    expect(createArg.data.slug).toMatch(/^engineering-/);
    expect(createArg.data.tenantId).toBe(TENANT);
    expect(createArg.data.createdBy).toBe(USER);

    // Verify audit log
    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
    const auditArg = (mockDb.auditLog.create as any).mock.calls[0][0];
    expect(auditArg.data.action).toBe("CREATE");
    expect(auditArg.data.entityType).toBe("Team");
  });

  it("resolves head name when headId is provided", async () => {
    mockDb.team.findFirst.mockResolvedValue(null);
    const createdTeam = {
      id: "new-t2",
      name: "Design",
      description: null,
      color: "#0066cc",
      headId: USER,
      slug: "design-abc123",
      createdAt: new Date(),
      createdBy: USER,
      tenantId: TENANT,
    };
    mockDb.team.create.mockResolvedValue(createdTeam as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);
    mockDb.user.findUnique.mockResolvedValue({
      firstName: "Test",
      lastName: "User",
    } as any);

    const res = await POST(buildPOST({ name: "Design", headId: USER }), { params: {} } as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.headName).toBe("Test User");
  });
});
