import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET as LIST, POST } from "@/app/api/teams/route";
import {
  GET as DETAIL,
  PATCH,
  DELETE,
} from "@/app/api/teams/[id]/route";

const USER = "user-admin-001";
const TENANT = "tenant-001";
const TEAM_ID = "team-001";

function buildRequest(method: string, url: string, body?: object): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(`http://localhost${url}`, init as never);
}

const routeContext = { params: { id: TEAM_ID } };

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
// GET /api/teams (list)
// ---------------------------------------------------------------------------
describe("GET /api/teams (list)", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await LIST(buildRequest("GET", "/api/teams"));
    expect(res.status).toBe(401);
  });

  it("returns team list for admin (happy path)", async () => {
    asAuthedAdmin();

    const now = new Date();
    mockDb.team.findMany.mockResolvedValue([
      {
        id: TEAM_ID,
        name: "Engineering",
        description: "Dev team",
        slug: "engineering-123",
        color: "#0066cc",
        headId: "u-head",
        parentTeamId: null,
        parentTeam: null,
        childTeams: [],
        createdAt: now,
        userTeams: [
          {
            user: {
              id: "u2",
              firstName: "Jane",
              lastName: "Doe",
              email: "jane@test.com",
              avatar: null,
            },
          },
        ],
      },
    ] as any);
    mockDb.team.count.mockResolvedValue(1);
    mockDb.user.findMany.mockResolvedValue([
      { id: "u-head", firstName: "Head", lastName: "Person" },
    ] as any);

    const res = await LIST(buildRequest("GET", "/api/teams"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Engineering");
    expect(body.data[0].memberCount).toBe(1);
    expect(body.data[0].headName).toBe("Head Person");
  });

  it("filters by tenantId (tenant isolation)", async () => {
    asAuthedAdmin();

    mockDb.team.findMany.mockResolvedValue([]);
    mockDb.team.count.mockResolvedValue(0);
    mockDb.user.findMany.mockResolvedValue([]);

    await LIST(buildRequest("GET", "/api/teams"));

    const findManyCall = mockDb.team.findMany.mock.calls[0]?.[0] as any;
    expect(findManyCall.where.tenantId).toBe(TENANT);
  });
});

// ---------------------------------------------------------------------------
// POST /api/teams
// ---------------------------------------------------------------------------
describe("POST /api/teams", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest("POST", "/api/teams", { name: "New Team" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing name", async () => {
    asAuthedAdmin();

    const res = await POST(
      buildRequest("POST", "/api/teams", { description: "No name" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when team name already exists", async () => {
    asAuthedAdmin();

    mockDb.team.findFirst.mockResolvedValue({ id: "existing" } as any);

    const res = await POST(
      buildRequest("POST", "/api/teams", { name: "Engineering" })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already exists");
  });

  it("creates team (happy path)", async () => {
    asAuthedAdmin();

    // No existing team with this name
    mockDb.team.findFirst.mockResolvedValue(null);

    const now = new Date();
    mockDb.team.create.mockResolvedValue({
      id: "t-new",
      tenantId: TENANT,
      name: "New Team",
      description: null,
      slug: "new-team-123",
      color: "#0066cc",
      headId: null,
      parentTeamId: null,
      createdAt: now,
      createdBy: USER,
    } as any);

    const res = await POST(
      buildRequest("POST", "/api/teams", { name: "New Team" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("New Team");
  });
});

// ---------------------------------------------------------------------------
// GET /api/teams/[id] (detail)
// ---------------------------------------------------------------------------
describe("GET /api/teams/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await DETAIL(
      buildRequest("GET", `/api/teams/${TEAM_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when team not in tenant", async () => {
    asAuthedAdmin();
    mockDb.team.findFirst.mockResolvedValue(null);

    const res = await DETAIL(
      buildRequest("GET", `/api/teams/${TEAM_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(404);
  });

  it("returns team detail (happy path)", async () => {
    asAuthedAdmin();

    const now = new Date();
    mockDb.team.findFirst.mockResolvedValue({
      id: TEAM_ID,
      name: "Engineering",
      description: "Dev team",
      slug: "engineering-123",
      color: "#0066cc",
      headId: null,
      parentTeamId: null,
      parentTeam: null,
      childTeams: [],
      createdAt: now,
      userTeams: [],
    } as any);

    const res = await DETAIL(
      buildRequest("GET", `/api/teams/${TEAM_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Engineering");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/teams/[id]
// ---------------------------------------------------------------------------
describe("PATCH /api/teams/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await PATCH(
      buildRequest("PATCH", `/api/teams/${TEAM_ID}`, { name: "Updated" }),
      routeContext as any
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when team not in tenant", async () => {
    asAuthedAdmin();
    mockDb.team.findFirst.mockResolvedValue(null);

    const res = await PATCH(
      buildRequest("PATCH", `/api/teams/${TEAM_ID}`, { name: "Updated" }),
      routeContext as any
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when team tries to be its own parent", async () => {
    asAuthedAdmin();
    mockDb.team.findFirst.mockResolvedValue({
      id: TEAM_ID,
      name: "Engineering",
      tenantId: TENANT,
    } as any);

    const res = await PATCH(
      buildRequest("PATCH", `/api/teams/${TEAM_ID}`, { parentTeamId: TEAM_ID }),
      routeContext as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("own parent");
  });

  it("updates team (happy path)", async () => {
    asAuthedAdmin();
    // First findFirst: find the team being updated
    // Second findFirst: uniqueness check (no other team with the new name)
    mockDb.team.findFirst
      .mockResolvedValueOnce({
        id: TEAM_ID,
        name: "Engineering",
        tenantId: TENANT,
      } as any)
      .mockResolvedValueOnce(null); // no duplicate name

    mockDb.team.update.mockResolvedValue({
      id: TEAM_ID,
      name: "Engineering v2",
      tenantId: TENANT,
    } as any);

    const res = await PATCH(
      buildRequest("PATCH", `/api/teams/${TEAM_ID}`, { name: "Engineering v2" }),
      routeContext as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Engineering v2");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/teams/[id]
// ---------------------------------------------------------------------------
describe("DELETE /api/teams/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await DELETE(
      buildRequest("DELETE", `/api/teams/${TEAM_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when team not in tenant", async () => {
    asAuthedAdmin();
    mockDb.team.findFirst.mockResolvedValue(null);

    const res = await DELETE(
      buildRequest("DELETE", `/api/teams/${TEAM_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when team has child teams", async () => {
    asAuthedAdmin();
    mockDb.team.findFirst.mockResolvedValue({
      id: TEAM_ID,
      tenantId: TENANT,
      _count: { userTeams: 3, childTeams: 2 },
    } as any);

    const res = await DELETE(
      buildRequest("DELETE", `/api/teams/${TEAM_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("child teams");
  });

  it("deletes team (happy path)", async () => {
    asAuthedAdmin();
    mockDb.team.findFirst.mockResolvedValue({
      id: TEAM_ID,
      tenantId: TENANT,
      _count: { userTeams: 1, childTeams: 0 },
    } as any);
    mockDb.userTeam.deleteMany.mockResolvedValue({ count: 1 } as any);
    mockDb.membership.updateMany.mockResolvedValue({ count: 0 } as any);
    mockDb.team.delete.mockResolvedValue({ id: TEAM_ID } as any);

    const res = await DELETE(
      buildRequest("DELETE", `/api/teams/${TEAM_ID}`),
      routeContext as any
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Team deleted");
  });
});
