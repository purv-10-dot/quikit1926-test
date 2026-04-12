import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/performance/cycle/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-cycle-1";

// ---- Helpers ----------------------------------------------------------------

function buildGET(): NextRequest {
  return new NextRequest("http://localhost/api/performance/cycle");
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

/** Build a quarter that contains `today`, spanning `totalWeeks` weeks. */
function buildQuarter(weekInQuarter: number, totalWeeks = 13) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (weekInQuarter - 1) * 7);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + totalWeeks * 7 - 1);

  return {
    id: "qs1",
    fiscalYear: 2026,
    quarter: "Q2",
    startDate,
    endDate,
  };
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════
// GET /api/performance/cycle — auth
// ═══════════════════════════════════════════════

describe("GET /api/performance/cycle — auth", () => {
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
// GET /api/performance/cycle — no active quarter
// ═══════════════════════════════════════════════

describe("GET /api/performance/cycle — no active quarter", () => {
  beforeEach(asAdmin);

  it("returns phase=closed with null quarter when no quarter found", async () => {
    mockDb.quarterSetting.findFirst.mockResolvedValue(null);

    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.phase).toBe("closed");
    expect(body.data.quarter).toBeNull();
    expect(body.data.year).toBeNull();
    expect(body.data.message).toMatch(/no active quarter/i);
  });
});

// ═══════════════════════════════════════════════
// GET /api/performance/cycle — phase computation
// ═══════════════════════════════════════════════

describe("GET /api/performance/cycle — phase computation", () => {
  beforeEach(asAdmin);

  it("returns quarter-kickoff phase in week 1", async () => {
    const quarter = buildQuarter(1);
    mockDb.quarterSetting.findFirst.mockResolvedValue(quarter as any);
    mockDb.performanceReview.findFirst.mockResolvedValue(null);
    mockDb.goal.count.mockResolvedValue(0);
    mockDb.performanceReview.count.mockResolvedValue(0);

    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.phase).toBe("quarter-kickoff");
  });

  it("returns execution phase in week 5", async () => {
    const quarter = buildQuarter(5);
    mockDb.quarterSetting.findFirst.mockResolvedValue(quarter as any);
    mockDb.performanceReview.findFirst.mockResolvedValue(null);
    mockDb.goal.count.mockResolvedValue(0);
    mockDb.performanceReview.count.mockResolvedValue(0);

    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.phase).toBe("execution");
  });

  it("returns self-assessment phase in week 12", async () => {
    const quarter = buildQuarter(12);
    mockDb.quarterSetting.findFirst.mockResolvedValue(quarter as any);
    mockDb.performanceReview.findFirst.mockResolvedValue(null);
    mockDb.goal.count.mockResolvedValue(0);
    mockDb.performanceReview.count.mockResolvedValue(0);

    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.phase).toBe("self-assessment");
  });

  it("returns manager-review phase in week 13", async () => {
    const quarter = buildQuarter(13);
    mockDb.quarterSetting.findFirst.mockResolvedValue(quarter as any);
    mockDb.performanceReview.findFirst.mockResolvedValue(null);
    mockDb.goal.count.mockResolvedValue(0);
    mockDb.performanceReview.count.mockResolvedValue(0);

    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.phase).toBe("manager-review");
  });
});

// ═══════════════════════════════════════════════
// GET /api/performance/cycle — full response shape
// ═══════════════════════════════════════════════

describe("GET /api/performance/cycle — response shape", () => {
  beforeEach(asAdmin);

  it("returns complete cycle data with metrics and goals", async () => {
    const quarter = buildQuarter(5);
    mockDb.quarterSetting.findFirst.mockResolvedValue(quarter as any);
    mockDb.performanceReview.findFirst.mockResolvedValue({
      id: "pr1",
      status: "self-assessment",
      rating: null,
      overallScore: null,
      updatedAt: new Date(),
    } as any);
    // goal.count is called 4 times: activeGoals, totalGoals, orgGoalsActive + 1 extra
    mockDb.goal.count
      .mockResolvedValueOnce(3)  // activeGoalsCount
      .mockResolvedValueOnce(5)  // totalGoalsCount
      .mockResolvedValueOnce(10); // orgGoalsActive
    mockDb.performanceReview.count
      .mockResolvedValueOnce(8)   // orgReviewsPending
      .mockResolvedValueOnce(12); // orgReviewsComplete

    const res = await GET(buildGET(), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.phase).toBe("execution");
    expect(body.data.quarter).toBe("Q2");
    expect(body.data.year).toBe(2026);
    expect(body.data.weekInQuarter).toBeGreaterThanOrEqual(1);
    expect(body.data.weeksRemaining).toBeGreaterThanOrEqual(0);
    expect(body.data.userReview).toBeTruthy();
    expect(body.data.userReview.status).toBe("self-assessment");
    expect(body.data.goals.active).toBe(3);
    expect(body.data.goals.total).toBe(5);
    expect(body.data.metrics.orgReviewsPending).toBe(8);
    expect(body.data.metrics.orgReviewsComplete).toBe(12);
    expect(body.data.metrics.orgGoalsActive).toBe(10);

    // Verify tenant isolation on quarterSetting query
    expect(mockDb.quarterSetting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });
});
