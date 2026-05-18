import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/kpi/[id]/summary/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-summary-1";
const OTHER_TENANT = "tenant-other-1";
const KPI_ID = "ckkpi0000000000000000000001";

function buildRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/kpi/${KPI_ID}/summary`, { method: "GET" });
}

function asAuthedAdmin() {
  setSession({ id: USER, orgId: TENANT, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    orgId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

function makeKPIFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: KPI_ID,
    orgId: TENANT,
    name: "Q1 Sales Target",
    kpiLevel: "individual",
    owner: USER,
    quarter: "Q1",
    year: 2026,
    measurementUnit: "USD",
    target: 100000,
    qtdAchieved: 65000,
    progressPercent: 65,
    healthStatus: "on-track",
    lastNotes: "Steady progress this quarter.",
    owner_user: { id: USER, firstName: "Test", lastName: "User" },
    weeklyValues: [
      { weekNumber: 8, value: 8500 },
      { weekNumber: 7, value: 8000 },
      { weekNumber: 6, value: 7500 },
      { weekNumber: 5, value: 7000 },
      { weekNumber: 4, value: 6500 },
      { weekNumber: 3, value: 6000 },
      { weekNumber: 2, value: 5500 },
      { weekNumber: 1, value: 5000 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/kpi/[id]/summary — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildRequest(), { params: { id: KPI_ID } } as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

describe("GET /api/kpi/[id]/summary — tenant isolation", () => {
  beforeEach(asAuthedAdmin);

  it("returns 403 when KPI belongs to a different org", async () => {
    mockDb.kPI.findUnique.mockResolvedValue(
      makeKPIFixture({ orgId: OTHER_TENANT }) as any,
    );

    const res = await GET(buildRequest(), { params: { id: KPI_ID } } as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("queries Prisma by the KPI id from route params", async () => {
    mockDb.kPI.findUnique.mockResolvedValue(makeKPIFixture() as any);
    await GET(buildRequest(), { params: { id: KPI_ID } } as any);
    const call = mockDb.kPI.findUnique.mock.calls[0]?.[0] as any;
    expect(call.where.id).toBe(KPI_ID);
    // PII guard: select must not request `email` on the owner_user relation.
    const ownerSelect = call.select.owner_user.select;
    expect(ownerSelect.email).toBeUndefined();
    expect(ownerSelect.firstName).toBe(true);
    expect(ownerSelect.lastName).toBe(true);
  });
});

describe("GET /api/kpi/[id]/summary — happy path", () => {
  beforeEach(asAuthedAdmin);

  it("returns the compact KPI projection with ownerName + url + weeklyValues", async () => {
    mockDb.kPI.findUnique.mockResolvedValue(makeKPIFixture() as any);

    const res = await GET(buildRequest(), { params: { id: KPI_ID } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const data = body.data;
    expect(data.id).toBe(KPI_ID);
    expect(data.name).toBe("Q1 Sales Target");
    expect(data.kpiLevel).toBe("individual");
    expect(data.owner_user).toEqual({ id: USER, firstName: "Test", lastName: "User" });
    expect(data.ownerName).toBeUndefined();
    expect(data.quarter).toBe("Q1");
    expect(data.year).toBe(2026);
    expect(data.measurementUnit).toBe("USD");
    expect(data.target).toBe(100000);
    expect(data.qtdAchieved).toBe(65000);
    expect(data.progressPercent).toBe(65);
    expect(data.healthStatus).toBe("on-track");
    expect(data.lastNotes).toBe("Steady progress this quarter.");
    expect(data.weeklyValues).toHaveLength(8);
    expect(data.weeklyValues[0]).toEqual({ weekNumber: 8, value: 8500 });
    expect(data.url).toBe(`/quikscale/kpi/${KPI_ID}`);

    // No email leakage anywhere in the response (PII guard).
    expect(JSON.stringify(body).toLowerCase()).not.toContain("email");
  });

  it("returns 404 when KPI is not found", async () => {
    mockDb.kPI.findUnique.mockResolvedValue(null);
    const res = await GET(buildRequest(), { params: { id: KPI_ID } } as any);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/kpi/[id]/summary — notes truncation", () => {
  beforeEach(asAuthedAdmin);

  it("truncates lastNotes to exactly 300 characters when longer", async () => {
    const longNotes = "a".repeat(500);
    mockDb.kPI.findUnique.mockResolvedValue(
      makeKPIFixture({ lastNotes: longNotes }) as any,
    );

    const res = await GET(buildRequest(), { params: { id: KPI_ID } } as any);
    const body = await res.json();
    expect(body.data.lastNotes).toHaveLength(300);
    expect(body.data.lastNotes).toBe("a".repeat(300));
  });

  it("leaves lastNotes intact when shorter than 300", async () => {
    mockDb.kPI.findUnique.mockResolvedValue(
      makeKPIFixture({ lastNotes: "short note" }) as any,
    );
    const res = await GET(buildRequest(), { params: { id: KPI_ID } } as any);
    const body = await res.json();
    expect(body.data.lastNotes).toBe("short note");
  });
});
