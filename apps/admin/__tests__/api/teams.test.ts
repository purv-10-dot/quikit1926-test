import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/teams/route";

const USER = "user-admin-001";
const TENANT = "tenant-admin-001";

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/teams", {
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
// GET /api/teams — auth
// ═══════════════════════════════════════════════

describe("GET /api/teams — auth", () => {
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
// GET /api/teams — happy path
// ═══════════════════════════════════════════════

describe("GET /api/teams — happy path", () => {
  beforeEach(asAdmin);

  it("returns teams with member count and head name", async () => {
    const mockTeam = {
      id: "t1",
      name: "Engineering",
      description: "Dev team",
      slug: "engineering",
      color: "#0066cc",
      headId: "h1",
      parentTeamId: null,
      parentTeam: null,
      childTeams: [],
      userTeams: [
        { user: { id: "u1", firstName: "Jane", lastName: "Doe", email: "j@t.com", avatar: null } },
        { user: { id: "u2", firstName: "John", lastName: "Smith", email: "js@t.com", avatar: null } },
      ],
      createdAt: new Date("2026-01-01"),
    };

    mockDb.team.findMany.mockResolvedValue([mockTeam] as any);
    mockDb.user.findMany.mockResolvedValue([
      { id: "h1", firstName: "Head", lastName: "Person" },
    ] as any);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].memberCount).toBe(2);
    expect(body.data[0].headName).toBe("Head Person");
  });

  it("returns empty array when no teams", async () => {
    mockDb.team.findMany.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════
// POST /api/teams — auth
// ═══════════════════════════════════════════════

describe("POST /api/teams — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST({ name: "Test" }));
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════
// POST /api/teams — validation
// ═══════════════════════════════════════════════

describe("POST /api/teams — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when name is missing", async () => {
    const res = await POST(buildPOST({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// POST /api/teams — duplicate detection
// ═══════════════════════════════════════════════

describe("POST /api/teams — duplicate name", () => {
  beforeEach(asAdmin);

  it("returns 409 when team name already exists", async () => {
    mockDb.team.findFirst.mockResolvedValue({ id: "existing", name: "Engineering" } as any);

    const res = await POST(buildPOST({ name: "Engineering" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already exists");
  });
});

// ═══════════════════════════════════════════════
// POST /api/teams — happy path
// ═══════════════════════════════════════════════

describe("POST /api/teams — happy path", () => {
  beforeEach(asAdmin);

  it("creates team and returns data", async () => {
    mockDb.team.findFirst.mockResolvedValue(null); // no duplicate
    mockDb.team.create.mockResolvedValue({
      id: "t-new",
      name: "New Team",
      slug: "new-team-1234",
      color: "#0066cc",
      tenantId: TENANT,
      description: null,
      headId: null,
      parentTeamId: null,
      createdAt: new Date(),
    } as any);

    const res = await POST(buildPOST({ name: "New Team" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("New Team");
    expect(body.data.memberCount).toBe(0);
  });
});
