import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/performance/goals/route";

const USER = "ckactor00000000000000000001";
const OTHER = "ckother00000000000000000001";
const TENANT = "tenant-goals-1";
const PARENT_GOAL = "ckgoal000000000000000000001";

// ---- Helpers ----------------------------------------------------------------

function buildGET(params = ""): NextRequest {
  return new NextRequest(`http://localhost/api/performance/goals${params ? "?" + params : ""}`);
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/performance/goals", {
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
  title: "Increase revenue by 20%",
  ownerId: OTHER,
  year: 2026,
  status: "active",
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/performance/goals — auth
// ═══════════════════════════════════════════════

describe("GET /api/performance/goals — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// GET /api/performance/goals — happy path
// ═══════════════════════════════════════════════

describe("GET /api/performance/goals — happy path", () => {
  beforeEach(asAdmin);

  it("returns paginated goals scoped to tenant", async () => {
    const mockGoal = {
      id: "g1",
      title: "Increase revenue",
      description: null,
      category: "business",
      ownerId: OTHER,
      parentGoalId: null,
      targetValue: 100,
      currentValue: 50,
      unit: "%",
      progressPercent: 50,
      quarter: "Q1",
      year: 2026,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      owner: { id: OTHER, firstName: "Other", lastName: "User", email: "o@t.com" },
    };
    mockDb.goal.count.mockResolvedValue(1);
    mockDb.goal.findMany.mockResolvedValue([mockGoal] as any);

    const res = await GET(buildGET("year=2026&quarter=Q1"), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);

    // Verify tenant isolation
    expect(mockDb.goal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/performance/goals — auth
// ═══════════════════════════════════════════════

describe("POST /api/performance/goals — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(validBody), { params: {} as any });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST(validBody), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// POST /api/performance/goals — validation
// ═══════════════════════════════════════════════

describe("POST /api/performance/goals — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when title is empty", async () => {
    const res = await POST(
      buildPOST({ ...validBody, title: "" }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when ownerId is not a cuid", async () => {
    const res = await POST(
      buildPOST({ ...validBody, ownerId: "not-a-cuid" }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when year is out of range", async () => {
    const res = await POST(
      buildPOST({ ...validBody, year: 1999 }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/performance/goals — owner membership validation
// ═══════════════════════════════════════════════

describe("POST /api/performance/goals — owner membership", () => {
  beforeEach(asAdmin);

  it("returns 400 when owner is not an active member", async () => {
    // The first mockDb.membership.findFirst resolves for asAdmin().
    // The second call (owner membership check) needs to return null.
    // Since withTenantAuth uses getTenantId which calls findFirst once,
    // we override the second call for the owner membership check.
    mockDb.membership.findFirst
      .mockResolvedValueOnce({
        id: "m1",
        userId: USER,
        tenantId: TENANT,
        role: "admin",
        status: "active",
      } as any)
      .mockResolvedValueOnce(null); // owner membership check

    const res = await POST(buildPOST(validBody), { params: {} as any });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not an active member/i);
  });
});

// ═══════════════════════════════════════════════
// POST /api/performance/goals — parent goal validation
// ═══════════════════════════════════════════════

describe("POST /api/performance/goals — parentGoalId validation", () => {
  beforeEach(asAdmin);

  it("returns 404 when parentGoalId does not exist in tenant", async () => {
    // Owner membership OK
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      role: "admin",
      status: "active",
    } as any);
    // Parent goal not found
    mockDb.goal.findFirst.mockResolvedValue(null);

    const res = await POST(
      buildPOST({ ...validBody, parentGoalId: PARENT_GOAL }),
      { params: {} as any },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/parent goal not found/i);
  });
});

// ═══════════════════════════════════════════════
// POST /api/performance/goals — happy path + auto-compute progressPercent
// ═══════════════════════════════════════════════

describe("POST /api/performance/goals — happy path", () => {
  beforeEach(asAdmin);

  it("creates a goal with 201", async () => {
    // Owner membership OK
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      role: "admin",
      status: "active",
    } as any);

    const createdGoal = {
      id: "new-g1",
      title: "Increase revenue by 20%",
      ownerId: OTHER,
      year: 2026,
      quarter: null,
      status: "active",
      progressPercent: null,
    };
    mockDb.goal.create.mockResolvedValue(createdGoal as any);

    const res = await POST(buildPOST(validBody), { params: {} as any });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("new-g1");
  });

  it("auto-computes progressPercent when targetValue and currentValue are set", async () => {
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      role: "admin",
      status: "active",
    } as any);

    mockDb.goal.create.mockResolvedValue({
      id: "new-g2",
      title: "x",
      ownerId: OTHER,
      year: 2026,
      quarter: null,
      status: "active",
      progressPercent: 50,
    } as any);

    await POST(
      buildPOST({ ...validBody, targetValue: 100, currentValue: 50 }),
      { params: {} as any },
    );

    const createArg = (mockDb.goal.create as any).mock.calls[0][0];
    expect(createArg.data.progressPercent).toBe(50);
    expect(createArg.data.tenantId).toBe(TENANT);
    expect(createArg.data.createdBy).toBe(USER);
  });
});
