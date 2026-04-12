import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

import { GET, POST } from "@/app/api/kpi/[id]/weekly/route";

const USER = "ckactor00000000000000000001";
const OTHER = "ckactor00000000000000000002";
const TENANT = "tenant-kpi-weekly-1";
const KPI_ID = "ckkpi000000000000000000001";

function buildGET(): NextRequest {
  return new NextRequest(`http://localhost/api/kpi/${KPI_ID}/weekly`);
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/kpi/${KPI_ID}/weekly`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function asAdmin() {
  setSession({ id: USER, tenantId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1", userId: USER, tenantId: TENANT, role: "admin", status: "active",
  } as any);
}

const fakeKPI = {
  tenantId: TENANT,
  qtdGoal: 100,
  target: 100,
  status: "active",
  quarter: "Q1",
  year: 2026,
  kpiLevel: "individual",
  owner: USER,
  ownerIds: [],
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

/* ═══════════ GET /api/kpi/[id]/weekly ═══════════ */

describe("GET /api/kpi/[id]/weekly — auth", () => {
  it("401 unauthenticated", async () => {
    const res = await GET(buildGET(), { params: { id: KPI_ID } });
    expect(res.status).toBe(401);
  });

  it("403 no membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await GET(buildGET(), { params: { id: KPI_ID } });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/kpi/[id]/weekly — tenant scope", () => {
  beforeEach(asAdmin);

  it("404 when KPI not found", async () => {
    mockDb.kPI.findUnique.mockResolvedValue(null);
    const res = await GET(buildGET(), { params: { id: KPI_ID } });
    expect(res.status).toBe(404);
  });

  it("403 when KPI belongs to another tenant", async () => {
    mockDb.kPI.findUnique.mockResolvedValue({ tenantId: "other-tenant" } as any);
    const res = await GET(buildGET(), { params: { id: KPI_ID } });
    expect(res.status).toBe(403);
  });

  it("200 returns weekly values", async () => {
    mockDb.kPI.findUnique.mockResolvedValue({ tenantId: TENANT } as any);
    mockDb.kPIWeeklyValue.findMany.mockResolvedValue([
      { id: "wv1", userId: USER, weekNumber: 1, value: 10, notes: null, createdAt: new Date(), updatedAt: new Date() },
    ] as any);

    const res = await GET(buildGET(), { params: { id: KPI_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].weekNumber).toBe(1);
  });
});

/* ═══════════ POST /api/kpi/[id]/weekly ═══════════ */

describe("POST /api/kpi/[id]/weekly — auth", () => {
  it("401 unauthenticated", async () => {
    const res = await POST(buildPOST({ weekNumber: 1, value: 10 }), { params: { id: KPI_ID } });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/kpi/[id]/weekly — individual KPI happy path", () => {
  beforeEach(() => {
    asAdmin();
    mockDb.kPI.findUnique.mockResolvedValue(fakeKPI as any);
    // canEditKPIOwnerWeekly: admin always allowed
    mockDb.team.findFirst.mockResolvedValue(null);
    // Feature flags: past-week edit ALLOWED
    mockDb.featureFlag.findMany.mockResolvedValue([]);
  });

  it("creates a weekly value and recalculates progress", async () => {
    // No existing row
    mockDb.kPIWeeklyValue.findFirst.mockResolvedValue(null);
    mockDb.kPIWeeklyValue.create.mockResolvedValue({
      id: "wv-new", kpiId: KPI_ID, userId: USER, weekNumber: 3, value: 25, notes: null,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    // Aggregate: 25 total
    mockDb.kPIWeeklyValue.findMany.mockResolvedValue([{ value: 25 }] as any);
    mockDb.kPI.update.mockResolvedValue({} as any);
    mockDb.kPILog.create.mockResolvedValue({} as any);

    const res = await POST(buildPOST({ weekNumber: 3, value: 25 }), { params: { id: KPI_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.weekNumber).toBe(3);

    // Verify KPI aggregate update
    const updateArg = (mockDb.kPI.update as any).mock.calls[0][0];
    expect(updateArg.data.qtdAchieved).toBe(25);
    expect(updateArg.data.progressPercent).toBe(25); // 25/100 * 100
    expect(updateArg.data.healthStatus).toBe("critical"); // <80%
  });

  it("updates an existing weekly value (upsert)", async () => {
    mockDb.kPIWeeklyValue.findFirst.mockResolvedValue({ id: "wv-existing" } as any);
    mockDb.kPIWeeklyValue.update.mockResolvedValue({
      id: "wv-existing", kpiId: KPI_ID, userId: USER, weekNumber: 3, value: 50, notes: "revised",
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    mockDb.kPIWeeklyValue.findMany.mockResolvedValue([{ value: 50 }] as any);
    mockDb.kPI.update.mockResolvedValue({} as any);
    mockDb.kPILog.create.mockResolvedValue({} as any);

    const res = await POST(buildPOST({ weekNumber: 3, value: 50, notes: "revised" }), { params: { id: KPI_ID } });
    expect(res.status).toBe(200);
    expect(mockDb.kPIWeeklyValue.update).toHaveBeenCalledOnce();
    expect(mockDb.kPIWeeklyValue.create).not.toHaveBeenCalled();
  });

  it("writes a KPI log entry with UPDATE_WEEKLY action", async () => {
    mockDb.kPIWeeklyValue.findFirst.mockResolvedValue(null);
    mockDb.kPIWeeklyValue.create.mockResolvedValue({
      id: "wv", kpiId: KPI_ID, userId: USER, weekNumber: 1, value: 10,
    } as any);
    mockDb.kPIWeeklyValue.findMany.mockResolvedValue([{ value: 10 }] as any);
    mockDb.kPI.update.mockResolvedValue({} as any);
    mockDb.kPILog.create.mockResolvedValue({} as any);

    await POST(buildPOST({ weekNumber: 1, value: 10 }), { params: { id: KPI_ID } });

    const logArg = (mockDb.kPILog.create as any).mock.calls[0][0];
    expect(logArg.data.action).toBe("UPDATE_WEEKLY");
    expect(logArg.data.tenantId).toBe(TENANT);
    expect(logArg.data.kpiId).toBe(KPI_ID);
  });
});

describe("POST /api/kpi/[id]/weekly — team KPI", () => {
  beforeEach(() => {
    asAdmin();
    mockDb.kPI.findUnique.mockResolvedValue({
      ...fakeKPI,
      kpiLevel: "team",
      owner: null,
      ownerIds: [USER, OTHER],
    } as any);
    mockDb.team.findFirst.mockResolvedValue(null);
    mockDb.featureFlag.findMany.mockResolvedValue([]);
  });

  it("400 when userId is omitted for team KPI", async () => {
    const res = await POST(buildPOST({ weekNumber: 1, value: 10 }), { params: { id: KPI_ID } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/userId.*required.*team/i);
  });

  it("400 when userId is not in ownerIds", async () => {
    const res = await POST(
      buildPOST({ weekNumber: 1, value: 10, userId: "cknotanowner000000000000001" }),
      { params: { id: KPI_ID } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not an owner/i);
  });

  it("200 when userId is a valid owner", async () => {
    mockDb.kPIWeeklyValue.findFirst.mockResolvedValue(null);
    mockDb.kPIWeeklyValue.create.mockResolvedValue({
      id: "wv", kpiId: KPI_ID, userId: OTHER, weekNumber: 1, value: 15,
    } as any);
    mockDb.kPIWeeklyValue.findMany.mockResolvedValue([{ value: 15 }] as any);
    mockDb.kPI.update.mockResolvedValue({} as any);
    mockDb.kPILog.create.mockResolvedValue({} as any);

    const res = await POST(
      buildPOST({ weekNumber: 1, value: 15, userId: OTHER }),
      { params: { id: KPI_ID } },
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/kpi/[id]/weekly — health status computation", () => {
  beforeEach(() => {
    asAdmin();
    mockDb.kPI.findUnique.mockResolvedValue(fakeKPI as any);
    mockDb.team.findFirst.mockResolvedValue(null);
    mockDb.featureFlag.findMany.mockResolvedValue([]);
    mockDb.kPIWeeklyValue.findFirst.mockResolvedValue(null);
    mockDb.kPILog.create.mockResolvedValue({} as any);
  });

  const runWithTotal = async (totalValue: number) => {
    mockDb.kPIWeeklyValue.create.mockResolvedValue({
      id: "wv", kpiId: KPI_ID, userId: USER, weekNumber: 1, value: totalValue,
    } as any);
    mockDb.kPIWeeklyValue.findMany.mockResolvedValue([{ value: totalValue }] as any);
    mockDb.kPI.update.mockResolvedValue({} as any);

    await POST(buildPOST({ weekNumber: 1, value: totalValue }), { params: { id: KPI_ID } });
    return (mockDb.kPI.update as any).mock.calls[0][0].data;
  };

  it("sets healthStatus to 'on-track' when progress >= 100%", async () => {
    const data = await runWithTotal(100);
    expect(data.healthStatus).toBe("on-track");
    expect(data.progressPercent).toBe(100);
  });

  it("sets healthStatus to 'behind-schedule' when 80% <= progress < 100%", async () => {
    const data = await runWithTotal(85);
    expect(data.healthStatus).toBe("behind-schedule");
  });

  it("sets healthStatus to 'critical' when progress < 80%", async () => {
    const data = await runWithTotal(50);
    expect(data.healthStatus).toBe("critical");
  });
});

describe("POST /api/kpi/[id]/weekly — past-week enforcement", () => {
  it("blocks edit of past week when feature flag is OFF", async () => {
    asAdmin();
    mockDb.kPI.findUnique.mockResolvedValue(fakeKPI as any);
    mockDb.team.findFirst.mockResolvedValue(null);
    // Feature flags: edit_past_week_data is DISABLED
    mockDb.featureFlag.findMany.mockResolvedValue([
      { key: "edit_past_week_data", enabled: false, value: null },
    ] as any);
    // Current fiscal week is 5
    mockDb.quarterSetting.findFirst.mockResolvedValue({
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-06-30"),
    } as any);

    const res = await POST(
      buildPOST({ weekNumber: 1, value: 10 }), // week 1 < current week 5
      { params: { id: KPI_ID } },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/past week/i);
  });
});
