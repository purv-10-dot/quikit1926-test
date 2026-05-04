import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/priority/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-priority-1";

// ---- Helpers ----------------------------------------------------------------

function buildGET(params = ""): NextRequest {
  return new NextRequest(`http://localhost/api/priority${params ? "?" + params : ""}`);
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/priority", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function asAdmin() {
  setSession({ id: USER, orgId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    orgId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

const validBody = {
  name: "Ship v2",
  owner: USER,
  quarter: "Q1",
  year: 2026,
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/priority — auth
// ═══════════════════════════════════════════════

describe("GET /api/priority — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET(), { params: {} } as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET(buildGET(), { params: {} } as any);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// GET /api/priority — tenant isolation + happy path
// ═══════════════════════════════════════════════

describe("GET /api/priority — happy path", () => {
  beforeEach(asAdmin);

  it("returns paginated priorities scoped to tenant", async () => {
    const mockPriority = {
      id: "p1",
      name: "Ship v2",
      owner: USER,
      quarter: "Q1",
      year: 2026,
      overallStatus: "on-track",
      createdAt: new Date(),
      updatedAt: new Date(),
      owner_user: { id: USER, firstName: "Test", lastName: "User" },
      team: null,
      weeklyStatuses: [],
    };
    mockDb.priority.findMany.mockResolvedValue([mockPriority] as any);
    mockDb.priority.count.mockResolvedValue(1);

    const res = await GET(buildGET("year=2026&quarter=Q1"), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);

    // Verify tenant isolation in the where clause
    expect(mockDb.priority.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: TENANT }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/priority — auth
// ═══════════════════════════════════════════════

describe("POST /api/priority — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(validBody), { params: {} } as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST(validBody), { params: {} } as any);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════
// POST /api/priority — Zod validation
// ═══════════════════════════════════════════════

describe("POST /api/priority — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when name is empty", async () => {
    const res = await POST(buildPOST({ ...validBody, name: "" }), { params: {} } as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when quarter is invalid", async () => {
    const res = await POST(buildPOST({ ...validBody, quarter: "Q5" }), { params: {} } as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when owner is missing", async () => {
    const res = await POST(buildPOST({ ...validBody, owner: "" }), { params: {} } as any);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════
// POST /api/priority — happy path
// ═══════════════════════════════════════════════

describe("POST /api/priority — happy path", () => {
  beforeEach(asAdmin);

  it("creates a priority with 201 and writes audit log", async () => {
    const createdPriority = {
      id: "new-p1",
      name: "Ship v2",
      owner: USER,
      quarter: "Q1",
      year: 2026,
      overallStatus: "not-yet-started",
      createdAt: new Date(),
      updatedAt: new Date(),
      owner_user: { id: USER, firstName: "Test", lastName: "User" },
      team: null,
      weeklyStatuses: [],
    };
    mockDb.priority.create.mockResolvedValue(createdPriority as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await POST(buildPOST(validBody), { params: {} } as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("new-p1");

    // Verify audit log was written
    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
    const auditArg = (mockDb.auditLog.create as any).mock.calls[0][0];
    expect(auditArg.data.action).toBe("CREATE");
    expect(auditArg.data.entityType).toBe("Priority");
  });

  it("seeds weekly statuses: past=not-yet-started, current+future=not-applicable", async () => {
    mockDb.priority.create.mockResolvedValue({
      id: "new-p3",
      owner_user: null,
      team: null,
      weeklyStatuses: [],
    } as any);
    // getCurrentFiscalWeekFromDB reads quarterSetting; return a window where
    // "now" sits at week 5 (start = 4 weeks before today, end = 8 weeks after).
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    mockDb.quarterSetting.findFirst.mockResolvedValue({
      startDate: new Date(now - 4 * week),
      endDate: new Date(now + 8 * week),
    } as any);
    mockDb.priorityWeeklyStatus.createMany.mockResolvedValue({ count: 13 } as any);
    mockDb.priority.findUnique.mockResolvedValue({
      id: "new-p3",
      owner_user: null,
      team: null,
      weeklyStatuses: [],
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await POST(
      buildPOST({ ...validBody, startWeek: 1, endWeek: 13 }),
      { params: {} } as any,
    );

    expect(mockDb.priorityWeeklyStatus.createMany).toHaveBeenCalledOnce();
    const seedArg = (mockDb.priorityWeeklyStatus.createMany as any).mock.calls[0][0];
    const seeds: Array<{ weekNumber: number; status: string }> = seedArg.data;
    expect(seeds).toHaveLength(13);
    // Weeks 1..4 are past → not-yet-started
    for (const w of [1, 2, 3, 4]) {
      expect(seeds.find((s) => s.weekNumber === w)?.status).toBe("not-yet-started");
    }
    // Week 5 (current) and 6..13 (future) → not-applicable
    for (const w of [5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      expect(seeds.find((s) => s.weekNumber === w)?.status).toBe("not-applicable");
    }
  });

  it("does not seed weekly statuses when startWeek/endWeek are missing", async () => {
    mockDb.priority.create.mockResolvedValue({
      id: "new-p4",
      owner_user: null,
      team: null,
      weeklyStatuses: [],
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await POST(buildPOST(validBody), { params: {} } as any);

    expect(mockDb.priorityWeeklyStatus.createMany).not.toHaveBeenCalled();
  });

  it("stores orgId and createdBy from the session", async () => {
    mockDb.priority.create.mockResolvedValue({
      id: "new-p2",
      name: "Ship v2",
      owner_user: null,
      team: null,
      weeklyStatuses: [],
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await POST(buildPOST(validBody), { params: {} } as any);

    const createArg = (mockDb.priority.create as any).mock.calls[0][0];
    expect(createArg.data.orgId).toBe(TENANT);
    expect(createArg.data.createdBy).toBe(USER);
  });
});
