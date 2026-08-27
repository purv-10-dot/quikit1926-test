import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/opsp/review/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-review-1";
const OPSP_ID = "opsp-review-001";

function buildGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/opsp/review${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/opsp/review", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// The withOrgAuth wrapper's returned handler takes Next's route context as a
// required second argument. This route has no dynamic segments, so `params` is
// always empty — these callers keep that noise out of the 17 call sites below.
const ROUTE_CTX = { params: {} };
const callGET = (req: NextRequest) => GET(req, ROUTE_CTX);
const callPOST = (req: NextRequest) => POST(req, ROUTE_CTX);

function asAdmin() {
  setSession({ id: USER, orgId: TENANT, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    orgId: TENANT,
    role: "admin",
    status: "active",
  } as any);
  // Route calls these unconditionally / conditionally — shared default to empty
  // so individual tests only override when shape matters.
  mockDb.categoryMaster.findMany.mockResolvedValue([] as any);
  mockDb.user.findMany.mockResolvedValue([] as any);
  // The POST handler reads prior review entries for the audit snapshot
  // before upserting. Without this default the second-round merge's new
  // pre-upsert read throws on .map(undefined) and the handler 500s.
  mockDb.oPSPReviewEntry.findMany.mockResolvedValue([] as any);
  mockDb.org.findUnique.mockResolvedValue({ name: "Test Org" } as any);
  mockDb.auditLog.create.mockResolvedValue({} as any);
}

function mockOPSP(overrides: Record<string, unknown> = {}) {
  return {
    id: OPSP_ID,
    orgId: TENANT,
    userId: USER,
    year: 2026,
    quarter: "Q1",
    status: "draft",
    targetYears: 5,
    actionsQtr: [
      { category: "Revenue", projected: "2", m1: "", m2: "", m3: "" },
      { category: "Clients", projected: "5", m1: "5", m2: "5", m3: "5" },
    ],
    goalRows: [
      { category: "Revenue", projected: "10", q1: "2", q2: "3", q3: "3", q4: "2" },
    ],
    targetRows: [
      { category: "Revenue", projected: "50", y1: "8", y2: "10", y3: "12", y4: "10", y5: "10" },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

/* ═══════════════════════════════════════════════
   GET /api/opsp/review — auth
   ═══════════════════════════════════════════════ */

describe("GET /api/opsp/review — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await callGET(buildGET());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 403 when no active admin membership", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "employee",
      userId: USER,
      orgId: TENANT,
      status: "active",
    } as any);
    const res = await callGET(buildGET());
    expect(res.status).toBe(403);
  });
});

/* ═══════════════════════════════════════════════
   GET /api/opsp/review — happy path
   ═══════════════════════════════════════════════ */

describe("GET /api/opsp/review — happy path", () => {
  beforeEach(asAdmin);

  it("returns empty data when no OPSP exists", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue(null);

    const res = await callGET(buildGET("year=2026&quarter=Q1&horizon=quarter"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.opspId).toBeNull();
    expect(body.data.rows).toEqual([]);
  });

  it("returns quarter (actions) rows with no review entries", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue(mockOPSP() as any);
    mockDb.oPSPReviewEntry.findMany.mockResolvedValue([]);
    mockDb.org.findUnique.mockResolvedValue({ fiscalYearStart: 4 } as any);

    const res = await callGET(buildGET("year=2026&quarter=Q1&horizon=quarter"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.opspId).toBe(OPSP_ID);
    expect(body.data.rows).toHaveLength(2); // Revenue + Clients
    expect(body.data.rows[0].category).toBe("Revenue");
    // With no entries, achieved should be null
    expect(body.data.rows[0].periods.m1.achieved).toBeNull();
    // Target falls back to projected since m1 is empty
    expect(body.data.rows[0].periods.m1.target).toBe(2);
  });

  it("merges review entries with source rows", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue(mockOPSP() as any);
    // Prisma Decimal values coerce via Number() — mock with plain numbers
    mockDb.oPSPReviewEntry.findMany.mockResolvedValue([
      {
        rowIndex: 0,
        period: "m1",
        targetValue: 2,
        achievedValue: 1.5,
        comment: "Partial month",
        updatedAt: new Date(),
      },
    ] as any);
    mockDb.org.findUnique.mockResolvedValue({ fiscalYearStart: 4 } as any);

    const res = await callGET(buildGET("year=2026&quarter=Q1&horizon=quarter"));
    const body = await res.json();
    expect(body.data.rows[0].periods.m1.achieved).toBe(1.5);
    expect(body.data.rows[0].periods.m1.target).toBe(2);
  });

  it("returns yearly (goals) rows", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue(mockOPSP() as any);
    mockDb.oPSPReviewEntry.findMany.mockResolvedValue([]);
    mockDb.oPSPData.findMany.mockResolvedValue([]); // no quarter OPSPs for cascade
    mockDb.org.findUnique.mockResolvedValue({ fiscalYearStart: 4 } as any);

    const res = await callGET(buildGET("year=2026&quarter=Q1&horizon=yearly"));
    const body = await res.json();
    expect(body.data.rows).toHaveLength(1); // Revenue goals
    expect(body.data.rows[0].periods.q1.target).toBe(2); // per-period from goalRow
  });

  it("returns 3to5year (targets) rows", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue(mockOPSP() as any);
    mockDb.oPSPReviewEntry.findMany.mockResolvedValue([]);
    mockDb.oPSPData.findMany.mockResolvedValue([]); // no quarter OPSPs for cascade
    mockDb.org.findUnique.mockResolvedValue({ fiscalYearStart: 4 } as any);

    const res = await callGET(buildGET("year=2026&quarter=Q1&horizon=3to5year"));
    const body = await res.json();
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].periods.y1.target).toBe(8);
    expect(body.data.rows[0].periods.y5.target).toBe(10);
  });

  it("rejects invalid horizon", async () => {
    const res = await callGET(buildGET("horizon=invalid"));
    expect(res.status).toBe(400);
  });
});

/* ═══════════════════════════════════════════════
   POST /api/opsp/review — auth
   ═══════════════════════════════════════════════ */

describe("POST /api/opsp/review — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await callPOST(
      buildPOST({
        year: 2026, quarter: "Q1", horizon: "quarter",
        rowIndex: 0, category: "Revenue",
        entries: [{ period: "m1", achievedValue: 1.5 }],
      }),
    );
    expect(res.status).toBe(401);
  });
});

/* ═══════════════════════════════════════════════
   POST /api/opsp/review — validation
   ═══════════════════════════════════════════════ */

describe("POST /api/opsp/review — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 for missing required fields", async () => {
    const res = await callPOST(buildPOST({ year: 2026 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid horizon", async () => {
    const res = await callPOST(
      buildPOST({
        year: 2026, quarter: "Q1", horizon: "weekly",
        rowIndex: 0, category: "Revenue",
        entries: [{ period: "m1", achievedValue: 1 }],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid period", async () => {
    const res = await callPOST(
      buildPOST({
        year: 2026, quarter: "Q1", horizon: "quarter",
        rowIndex: 0, category: "Revenue",
        entries: [{ period: "w1", achievedValue: 1 }],
      }),
    );
    expect(res.status).toBe(400);
  });
});

/* ═══════════════════════════════════════════════
   POST /api/opsp/review — happy path
   ═══════════════════════════════════════════════ */

describe("POST /api/opsp/review — happy path", () => {
  beforeEach(asAdmin);

  it("upserts review entries and returns saved data", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue({ id: OPSP_ID } as any);
    mockDb.oPSPReviewEntry.upsert.mockResolvedValue({
      period: "m1",
      targetValue: { toNumber: () => 2 },
      achievedValue: { toNumber: () => 1.5 },
      comment: "test",
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await callPOST(
      buildPOST({
        year: 2026,
        quarter: "Q1",
        horizon: "quarter",
        rowIndex: 0,
        category: "Revenue",
        entries: [
          { period: "m1", targetValue: 2, achievedValue: 1.5, comment: "test" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(mockDb.oPSPReviewEntry.upsert).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when OPSP does not exist", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue(null);

    const res = await callPOST(
      buildPOST({
        year: 2026,
        quarter: "Q1",
        horizon: "quarter",
        rowIndex: 0,
        category: "Revenue",
        entries: [{ period: "m1", achievedValue: 1 }],
      }),
    );
    expect(res.status).toBe(404);
  });

  it("saves multiple entries in one request", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue({ id: OPSP_ID } as any);
    mockDb.oPSPReviewEntry.upsert.mockResolvedValue({
      period: "m1",
      targetValue: null,
      achievedValue: null,
      comment: null,
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    const res = await callPOST(
      buildPOST({
        year: 2026,
        quarter: "Q1",
        horizon: "quarter",
        rowIndex: 0,
        category: "Revenue",
        entries: [
          { period: "m1", achievedValue: 1.5, comment: "Jan" },
          { period: "m2", achievedValue: 2.0, comment: "Feb" },
          { period: "m3", achievedValue: 1.8, comment: "Mar" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(mockDb.oPSPReviewEntry.upsert).toHaveBeenCalledTimes(3);
  });

  it("scopes upsert to tenant", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue({ id: OPSP_ID } as any);
    mockDb.oPSPReviewEntry.upsert.mockResolvedValue({
      period: "m1", targetValue: null, achievedValue: null, comment: null,
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await callPOST(
      buildPOST({
        year: 2026, quarter: "Q1", horizon: "quarter",
        rowIndex: 0, category: "Revenue",
        entries: [{ period: "m1", achievedValue: 1 }],
      }),
    );

    const call = mockDb.oPSPReviewEntry.upsert.mock.calls[0]?.[0] as any;
    expect(call.where.orgId_opspId_horizon_rowIndex_period.orgId).toBe(TENANT);
    expect(call.create.orgId).toBe(TENANT);
    expect(call.create.userId).toBe(USER);
  });

  it("writes audit log after save", async () => {
    mockDb.oPSPData.findUnique.mockResolvedValue({ id: OPSP_ID } as any);
    mockDb.oPSPReviewEntry.upsert.mockResolvedValue({
      period: "m1", targetValue: null, achievedValue: null, comment: null,
    } as any);
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await callPOST(
      buildPOST({
        year: 2026, quarter: "Q1", horizon: "quarter",
        rowIndex: 0, category: "Revenue",
        entries: [{ period: "m1", achievedValue: 1 }],
      }),
    );

    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
    const logCall = mockDb.auditLog.create.mock.calls[0]?.[0] as any;
    expect(logCall.data.entityType).toBe("Review");
    expect(logCall.data.orgId).toBe(TENANT);
  });
});
