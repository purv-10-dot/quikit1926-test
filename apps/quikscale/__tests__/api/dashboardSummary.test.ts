import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/dashboard/summary/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-dash-1";

function buildGET(qs = "year=2026&quarter=Q1"): NextRequest {
  return new NextRequest(`http://localhost/api/dashboard/summary${qs ? "?" + qs : ""}`);
}

function asAuthedMember() {
  setSession({ id: USER, tenantId: TENANT, role: "employee" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    tenantId: TENANT,
    role: "employee",
    status: "active",
  } as any);
}

function stubEmptyDb() {
  mockDb.kPI.findMany.mockResolvedValue([] as any);
  mockDb.priority.findMany.mockResolvedValue([] as any);
  mockDb.wWWItem.findMany.mockResolvedValue([] as any);
  mockDb.team.findMany.mockResolvedValue([] as any);
  mockDb.membership.findMany.mockResolvedValue([] as any);
  mockDb.user.findMany.mockResolvedValue([] as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/dashboard/summary — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET(), { params: {} } as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when the user has no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "employee" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET(buildGET(), { params: {} } as any);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/dashboard/summary — validation", () => {
  beforeEach(asAuthedMember);

  it("returns 400 when year is missing", async () => {
    const res = await GET(buildGET("quarter=Q1"), { params: {} } as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when quarter is invalid", async () => {
    const res = await GET(buildGET("year=2026&quarter=Q9"), { params: {} } as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when both year and quarter are missing", async () => {
    const res = await GET(buildGET(""), { params: {} } as any);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/dashboard/summary — happy path", () => {
  beforeEach(asAuthedMember);

  it("returns all 6 arrays empty for a brand-new tenant", async () => {
    stubEmptyDb();
    const res = await GET(buildGET(), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.individualKPIs).toEqual([]);
    expect(body.data.teamKPIs).toEqual([]);
    expect(body.data.priorities).toEqual([]);
    expect(body.data.wwwItems).toEqual([]);
    expect(body.data.teams).toEqual([]);
    expect(body.data.users).toEqual([]);
  });

  it("scopes every query by tenantId", async () => {
    stubEmptyDb();
    await GET(buildGET(), { params: {} } as any);

    // KPI findMany called twice — individual + team level
    const kpiCalls = mockDb.kPI.findMany.mock.calls;
    expect(kpiCalls.length).toBe(2);
    for (const call of kpiCalls) {
      expect((call[0] as any).where.tenantId).toBe(TENANT);
      expect((call[0] as any).where.year).toBe(2026);
      expect((call[0] as any).where.quarter).toBe("Q1");
    }
    const levels = kpiCalls.map((c) => (c[0] as any).where.kpiLevel).sort();
    expect(levels).toEqual(["individual", "team"]);

    expect((mockDb.priority.findMany.mock.calls[0]?.[0] as any).where.tenantId).toBe(TENANT);
    expect((mockDb.wWWItem.findMany.mock.calls[0]?.[0] as any).where.tenantId).toBe(TENANT);
    expect((mockDb.team.findMany.mock.calls[0]?.[0] as any).where.tenantId).toBe(TENANT);
    expect((mockDb.membership.findMany.mock.calls[0]?.[0] as any).where.tenantId).toBe(TENANT);
  });

  it("caps each KPI list at 100 rows", async () => {
    stubEmptyDb();
    await GET(buildGET(), { params: {} } as any);
    for (const call of mockDb.kPI.findMany.mock.calls) {
      expect((call[0] as any).take).toBe(100);
    }
  });

  it("returns populated arrays when data exists", async () => {
    const now = new Date();
    const indKpi = {
      id: "k1",
      name: "Revenue",
      kpiLevel: "individual",
      owner: USER,
      ownerIds: [],
      teamId: null,
      quarter: "Q1",
      year: 2026,
      progressPercent: 50,
      weeklyValues: [],
      team: null,
      createdAt: now,
      updatedAt: now,
    };
    mockDb.kPI.findMany
      .mockResolvedValueOnce([indKpi] as any) // individual
      .mockResolvedValueOnce([] as any); // team

    mockDb.priority.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "Ship v2",
        owner: USER,
        quarter: "Q1",
        year: 2026,
        overallStatus: "on-track",
        createdAt: now,
        updatedAt: now,
        owner_user: { id: USER, firstName: "A", lastName: "B" },
        team: null,
        weeklyStatuses: [],
      },
    ] as any);

    mockDb.wWWItem.findMany.mockResolvedValue([
      {
        id: "w1",
        tenantId: TENANT,
        who: USER,
        what: "Ship it",
        when: now,
        status: "not-yet-started",
        notes: null,
        category: null,
        originalDueDate: null,
        revisedDates: [],
        createdBy: USER,
        createdAt: now,
        updatedAt: now,
      },
    ] as any);

    mockDb.team.findMany.mockResolvedValue([{ id: "t1", name: "Team A" }] as any);
    mockDb.membership.findMany.mockResolvedValue([
      { user: { id: USER, firstName: "A", lastName: "B", email: "a@b.c" } },
    ] as any);
    mockDb.user.findMany.mockResolvedValue([] as any);

    const res = await GET(buildGET(), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.individualKPIs).toHaveLength(1);
    expect(body.data.teamKPIs).toEqual([]);
    expect(body.data.priorities).toHaveLength(1);
    expect(body.data.wwwItems).toHaveLength(1);
    expect(body.data.wwwItems[0].when).toBe(now.toISOString());
    expect(body.data.teams).toHaveLength(1);
    expect(body.data.users).toHaveLength(1);
    expect(body.data.users[0].id).toBe(USER);
  });
});
