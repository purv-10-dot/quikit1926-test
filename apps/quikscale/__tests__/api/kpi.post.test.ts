import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

// Import route AFTER mocks are set up by vi.mock hoisting in setup.ts/mockDb.ts
import { POST } from "@/app/api/kpi/route";

const USER = "ckactor00000000000000000001";
const OTHER = "ckother00000000000000000001";
const TENANT = "tenant-1";
const TEAM = "ckteam00000000000000000001";

// ---- Helpers --------------------------------------------------------------

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/kpi", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Default stubs: authenticated admin in TENANT, feature flags OFF, no data. */
function asAdmin() {
  setSession({ id: USER, tenantId: TENANT, role: "admin" });
  // getTenantId: session has tenantId → verifies via membership findFirst
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    tenantId: TENANT,
    role: "admin",
    status: "active",
  } as any);
  // feature flag lookup
  mockDb.featureFlag.findMany.mockResolvedValue([]);
}

const baseIndividual = {
  name: "Revenue",
  kpiLevel: "individual",
  owner: USER,
  quarter: "Q1",
  year: 2026,
  measurementUnit: "Currency",
};

const baseTeam = {
  name: "Team Revenue",
  kpiLevel: "team",
  teamId: TEAM,
  ownerIds: [USER, OTHER],
  ownerContributions: { [USER]: 60, [OTHER]: 40 },
  quarter: "Q1",
  year: 2026,
  measurementUnit: "Currency",
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ---------------------------------------------------------------------------

describe("POST /api/kpi — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await POST(buildRequest(baseIndividual), { params: {} } as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when authenticated but no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await POST(buildRequest(baseIndividual), { params: {} } as any);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/kpi — Zod validation", () => {
  beforeEach(asAdmin);

  it("returns 500 on invalid body (Zod throws)", async () => {
    const res = await POST(buildRequest({ ...baseIndividual, name: "" }), { params: {} } as any);
    // The route catch-all wraps Zod errors as 500; accept 4xx or 500 until the
    // route is refactored to return 400 explicitly.
    expect([400, 500]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("rejects team KPI with contributions summing to 99 (Zod refine)", async () => {
    const input = {
      ...baseTeam,
      ownerContributions: { [USER]: 60, [OTHER]: 39 },
    };
    const res = await POST(buildRequest(input), { params: {} } as any);
    expect([400, 500]).toContain(res.status);
  });
});

describe("POST /api/kpi — individual happy path", () => {
  beforeEach(asAdmin);

  it("creates an individual KPI when owner exists", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: USER } as any);
    mockDb.kPI.create.mockResolvedValue({
      id: "new-kpi-1",
      name: "Revenue",
      kpiLevel: "individual",
      owner: USER,
    } as any);
    mockDb.kPILog.create.mockResolvedValue({} as any);

    const res = await POST(buildRequest(baseIndividual), { params: {} } as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("new-kpi-1");
    expect(mockDb.kPI.create).toHaveBeenCalledOnce();
  });

  it("returns 404 when owner user does not exist", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    const res = await POST(buildRequest(baseIndividual), { params: {} } as any);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/kpi — team KPI permission", () => {
  beforeEach(() => {
    // Non-admin membership (so canManageTeamKPI must check team head)
    setSession({ id: USER, tenantId: TENANT, role: "member" });
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      role: "employee",
      status: "active",
    } as any);
    mockDb.featureFlag.findMany.mockResolvedValue([]);
    // Team exists in tenant
    mockDb.team.findUnique.mockResolvedValue({
      id: TEAM,
      tenantId: TENANT,
      headId: "someone-else",
    } as any);
  });

  it("returns 403 when user is not team head and not admin", async () => {
    // canManageTeamKPI reads team.findFirst (not findUnique); simulate "not head"
    mockDb.team.findFirst.mockResolvedValue({ headId: "someone-else" } as any);
    const res = await POST(buildRequest(baseTeam), { params: {} } as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/team head or admin/i);
  });

  it("returns 404 when team does not exist in tenant", async () => {
    mockDb.team.findUnique.mockResolvedValue(null);
    const res = await POST(buildRequest(baseTeam), { params: {} } as any);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/kpi — team KPI happy path", () => {
  beforeEach(asAdmin);

  it("creates a team KPI when admin with valid owners", async () => {
    // Team exists in tenant
    mockDb.team.findUnique.mockResolvedValue({
      id: TEAM,
      tenantId: TENANT,
      headId: "head-user",
    } as any);
    // All owners are active members of the team
    mockDb.membership.findMany.mockResolvedValue([
      { userId: USER } as any,
      { userId: OTHER } as any,
    ]);
    mockDb.kPI.create.mockResolvedValue({
      id: "team-kpi-1",
      name: "Team Revenue",
      kpiLevel: "team",
      owner: null,
      teamId: TEAM,
    } as any);
    mockDb.kPILog.create.mockResolvedValue({} as any);

    const res = await POST(buildRequest(baseTeam), { params: {} } as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.kpiLevel).toBe("team");
  });

  it("returns 400 when an owner is not a team member", async () => {
    mockDb.team.findUnique.mockResolvedValue({
      id: TEAM,
      tenantId: TENANT,
      headId: "head-user",
    } as any);
    // Only USER is in the team — OTHER is missing
    mockDb.membership.findMany.mockResolvedValue([{ userId: USER } as any]);

    const res = await POST(buildRequest(baseTeam), { params: {} } as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not active members/i);
  });
});
