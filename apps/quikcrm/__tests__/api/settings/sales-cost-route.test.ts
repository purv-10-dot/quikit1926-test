/**
 * Sales Cost API — authorization, org isolation, and validation.
 *
 * The central requirement is that ONLY admin / administrator / org_admin can
 * read or write cost data. `isCrmAdminUser` runs for real here (it is a pure
 * role-set check, not mocked), so these tests exercise the actual gate rather
 * than a stub of it: every non-admin role the spec names is asserted to get a
 * 403, and the service is asserted never to have been called.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

mockDb();

vi.mock("@/lib/services/sales-cost/sales-cost-service", () => ({
  SalesCostError: class SalesCostError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  listSalesReps: vi.fn(async () => [
    { userId: "rep-1", name: "Rahul", email: "rahul@example.com", role: "SalesUser" },
  ]),
  getOrgSummary: vi.fn(async () => ({ period: "2026-08", rows: [] })),
  getRepBreakdown: vi.fn(async () => ({
    userId: "rep-1",
    userName: "Rahul",
    period: "2026-08",
    currency: "INR",
    salary: 40000,
    toolsCost: 13000,
    otherCost: 0,
    totalMonthlyCost: 53000,
    tools: [],
    otherCosts: [],
    counts: { leads: 100, prospects: 40, opportunities: 10, wonDeals: 5 },
    efficiency: {
      costPerLead: 530,
      costPerProspect: 1325,
      costPerOpportunity: 5300,
      costPerWonDeal: 10600,
    },
  })),
  listTools: vi.fn(async () => []),
  listOtherCosts: vi.fn(async () => []),
  listSalaryHistory: vi.fn(async () => []),
  setRepSalary: vi.fn(async () => ({
    id: "sal-1",
    monthlyAmount: 40000,
    currency: "INR",
    effectiveFrom: "2026-08-01T00:00:00.000Z",
    effectiveTo: null,
    notes: null,
  })),
  deleteSalary: vi.fn(async () => undefined),
  createTool: vi.fn(async () => ({ id: "tool-1", name: "LinkedIn Sales Navigator" })),
  updateTool: vi.fn(async () => ({ id: "tool-1", name: "LinkedIn Sales Navigator" })),
  deleteTool: vi.fn(async () => undefined),
  setToolPrice: vi.fn(async () => ({
    id: "price-2",
    cost: 10000,
    billingFrequency: "monthly",
    monthlyCost: 10000,
    currency: "INR",
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveTo: null,
    notes: null,
  })),
  deleteToolPrice: vi.fn(async () => undefined),
  createOtherCost: vi.fn(async () => ({ id: "oc-1", label: "Travel" })),
  updateOtherCost: vi.fn(async () => ({ id: "oc-1", label: "Travel" })),
  deleteOtherCost: vi.fn(async () => undefined),
}));

import {
  createOtherCost,
  createTool,
  deleteTool,
  deleteToolPrice,
  getOrgSummary,
  getRepBreakdown,
  setRepSalary,
  setToolPrice,
  updateTool,
} from "@/lib/services/sales-cost/sales-cost-service";

const MAIN = "@/app/api/settings/sales-cost/route";
const SALARY = "@/app/api/settings/sales-cost/salary/route";
const TOOLS = "@/app/api/settings/sales-cost/tools/route";
const TOOL_ITEM = "@/app/api/settings/sales-cost/tools/[id]/route";
const TOOL_PRICE = "@/app/api/settings/sales-cost/tools/[id]/price/route";
const TOOL_PRICE_ITEM = "@/app/api/settings/sales-cost/tools/[id]/price/[priceId]/route";
const OTHER = "@/app/api/settings/sales-cost/other-costs/route";

function req(url: string, method = "GET", body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

/** Every role the spec says must be denied. */
const DENIED_ROLES = [
  "SalesManager",
  "SalesUser",
  "MarketingUser",
  "FinanceUser",
  "sales_manager",
  "sales_user",
  "marketing_user",
  "finance_user",
  "member",
  "TeamManager",
];

/** Every role the spec says must be allowed. */
const ALLOWED_ROLES = ["Administrator", "admin", "administrator", "org_admin"];

beforeEach(() => {
  setSession(null);
  vi.clearAllMocks();
});

describe("GET /api/settings/sales-cost — authorization", () => {
  it("401 when unauthenticated", async () => {
    const { GET } = await import(MAIN);
    const res = await GET(req("http://test/api/settings/sales-cost"));
    expect(res.status).toBe(401);
    expect(getOrgSummary).not.toHaveBeenCalled();
  });

  it.each(DENIED_ROLES)("403 for %s and no cost data is read", async (role) => {
    setSession({ userId: "u2", orgId: "org-1", role });
    const { GET } = await import(MAIN);
    const res = await GET(req("http://test/api/settings/sales-cost"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    // The gate must run BEFORE any cost query — no salary figure should ever be
    // computed for a denied caller.
    expect(getOrgSummary).not.toHaveBeenCalled();
    expect(getRepBreakdown).not.toHaveBeenCalled();
  });

  it.each(ALLOWED_ROLES)("200 for %s", async (role) => {
    setSession({ userId: "u1", orgId: "org-1", role });
    const { GET } = await import(MAIN);
    const res = await GET(req("http://test/api/settings/sales-cost?period=2026-08"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.period).toBe("2026-08");
  });
});

describe("GET /api/settings/sales-cost — behaviour", () => {
  beforeEach(() => {
    setSession({ userId: "u1", orgId: "org-1", role: "Administrator" });
  });

  it("scopes the summary to the caller's own orgId", async () => {
    const { GET } = await import(MAIN);
    await GET(req("http://test/api/settings/sales-cost?period=2026-08"));
    expect(getOrgSummary).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ key: "2026-08" }),
    );
  });

  it("400 on a malformed period rather than falling back to the current month", async () => {
    const { GET } = await import(MAIN);
    const res = await GET(req("http://test/api/settings/sales-cost?period=2026-13"));
    expect(res.status).toBe(400);
    expect(getOrgSummary).not.toHaveBeenCalled();
  });

  it("returns a per-rep breakdown when userId is given", async () => {
    const { GET } = await import(MAIN);
    const res = await GET(
      req("http://test/api/settings/sales-cost?period=2026-08&userId=rep-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.breakdown.totalMonthlyCost).toBe(53000);
    expect(body.data.breakdown.efficiency.costPerLead).toBe(530);
    expect(getRepBreakdown).toHaveBeenCalledWith(
      "org-1",
      "rep-1",
      expect.objectContaining({ key: "2026-08" }),
      "Rahul",
    );
  });

  it("404 for a userId that is not a CRM user in this org (no cross-org probe)", async () => {
    const { GET } = await import(MAIN);
    const res = await GET(
      req("http://test/api/settings/sales-cost?userId=someone-elses-user"),
    );
    expect(res.status).toBe(404);
    expect(getRepBreakdown).not.toHaveBeenCalled();
  });
});

describe("POST /api/settings/sales-cost/salary", () => {
  it("401 when unauthenticated", async () => {
    const { POST } = await import(SALARY);
    const res = await POST(
      req("http://test/api/settings/sales-cost/salary", "POST", {
        userId: "rep-1",
        monthlyAmount: 40000,
      }),
    );
    expect(res.status).toBe(401);
    expect(setRepSalary).not.toHaveBeenCalled();
  });

  it.each(DENIED_ROLES)("403 for %s and does not write", async (role) => {
    setSession({ userId: "u2", orgId: "org-1", role });
    const { POST } = await import(SALARY);
    const res = await POST(
      req("http://test/api/settings/sales-cost/salary", "POST", {
        userId: "rep-1",
        monthlyAmount: 999999,
      }),
    );
    expect(res.status).toBe(403);
    expect(setRepSalary).not.toHaveBeenCalled();
  });

  it("201 for an admin, passing the caller's orgId and actor id", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "org_admin" });
    const { POST } = await import(SALARY);
    const res = await POST(
      req("http://test/api/settings/sales-cost/salary", "POST", {
        userId: "rep-1",
        monthlyAmount: 40000,
        effectiveFrom: "2026-08",
      }),
    );
    expect(res.status).toBe(201);
    expect(setRepSalary).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        userId: "rep-1",
        monthlyAmount: 40000,
        effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
      }),
      "u1",
    );
  });

  it("400 on a negative salary", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "Administrator" });
    const { POST } = await import(SALARY);
    const res = await POST(
      req("http://test/api/settings/sales-cost/salary", "POST", {
        userId: "rep-1",
        monthlyAmount: -100,
      }),
    );
    expect(res.status).toBe(400);
    expect(setRepSalary).not.toHaveBeenCalled();
  });

  it("400 when userId is missing", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "Administrator" });
    const { POST } = await import(SALARY);
    const res = await POST(
      req("http://test/api/settings/sales-cost/salary", "POST", { monthlyAmount: 40000 }),
    );
    expect(res.status).toBe(400);
  });
});

describe("tools routes", () => {
  const validTool = {
    name: "LinkedIn Sales Navigator",
    cost: 16000,
    billingFrequency: "monthly",
    startDate: "2026-08",
    allocations: [
      { userId: "rep-1", percentage: 50 },
      { userId: "rep-2", percentage: 50 },
    ],
  };

  it("401 unauthenticated on POST", async () => {
    const { POST } = await import(TOOLS);
    const res = await POST(
      req("http://test/api/settings/sales-cost/tools", "POST", validTool),
    );
    expect(res.status).toBe(401);
    expect(createTool).not.toHaveBeenCalled();
  });

  it.each(DENIED_ROLES)("403 for %s on POST", async (role) => {
    setSession({ userId: "u2", orgId: "org-1", role });
    const { POST } = await import(TOOLS);
    const res = await POST(
      req("http://test/api/settings/sales-cost/tools", "POST", validTool),
    );
    expect(res.status).toBe(403);
    expect(createTool).not.toHaveBeenCalled();
  });

  it("201 for an admin and forwards the shared 50/50 allocation", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "admin" });
    const { POST } = await import(TOOLS);
    const res = await POST(
      req("http://test/api/settings/sales-cost/tools", "POST", validTool),
    );
    expect(res.status).toBe(201);
    expect(createTool).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        name: "LinkedIn Sales Navigator",
        cost: 16000,
        allocations: [
          expect.objectContaining({ userId: "rep-1", percentage: 50 }),
          expect.objectContaining({ userId: "rep-2", percentage: 50 }),
        ],
      }),
      "u1",
    );
  });

  it("400 when a tool is created with no allocation", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "Administrator" });
    const { POST } = await import(TOOLS);
    const res = await POST(
      req("http://test/api/settings/sales-cost/tools", "POST", {
        ...validTool,
        allocations: [],
      }),
    );
    expect(res.status).toBe(400);
    expect(createTool).not.toHaveBeenCalled();
  });

  it("400 on an allocation above 100%", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "Administrator" });
    const { POST } = await import(TOOLS);
    const res = await POST(
      req("http://test/api/settings/sales-cost/tools", "POST", {
        ...validTool,
        allocations: [{ userId: "rep-1", percentage: 150 }],
      }),
    );
    expect(res.status).toBe(400);
    expect(createTool).not.toHaveBeenCalled();
  });

  it("400 on an unknown billing frequency", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "Administrator" });
    const { POST } = await import(TOOLS);
    const res = await POST(
      req("http://test/api/settings/sales-cost/tools", "POST", {
        ...validTool,
        billingFrequency: "fortnightly",
      }),
    );
    expect(res.status).toBe(400);
  });

  it.each(DENIED_ROLES)("403 for %s on PATCH and DELETE", async (role) => {
    setSession({ userId: "u2", orgId: "org-1", role });
    const { PATCH, DELETE } = await import(TOOL_ITEM);
    const patchRes = await PATCH(
      req("http://test/api/settings/sales-cost/tools/tool-1", "PATCH", { name: "Renamed" }),
      { params: { id: "tool-1" } },
    );
    const delRes = await DELETE(
      req("http://test/api/settings/sales-cost/tools/tool-1", "DELETE"),
      { params: { id: "tool-1" } },
    );

    expect(patchRes.status).toBe(403);
    expect(delRes.status).toBe(403);
    expect(updateTool).not.toHaveBeenCalled();
    expect(deleteTool).not.toHaveBeenCalled();
  });

  it("DELETE is org-scoped for an admin", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "Administrator" });
    const { DELETE } = await import(TOOL_ITEM);
    const res = await DELETE(
      req("http://test/api/settings/sales-cost/tools/tool-1", "DELETE"),
      { params: { id: "tool-1" } },
    );
    expect(res.status).toBe(200);
    expect(deleteTool).toHaveBeenCalledWith("org-1", "tool-1");
  });
});

describe("tool price versioning", () => {
  it("PATCH on a tool IGNORES price fields — repricing must go through .../price", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "Administrator" });
    const { PATCH } = await import(TOOL_ITEM);
    const res = await PATCH(
      req("http://test/api/settings/sales-cost/tools/tool-1", "PATCH", {
        name: "Renamed",
        // A client sending these must not be able to rewrite historical cost.
        cost: 99999,
        billingFrequency: "annual",
        currency: "USD",
      }),
      { params: { id: "tool-1" } },
    );

    expect(res.status).toBe(200);
    const [, , patch] = vi.mocked(updateTool).mock.calls[0]!;
    expect(patch).not.toHaveProperty("cost");
    expect(patch).not.toHaveProperty("billingFrequency");
    expect(patch).not.toHaveProperty("currency");
    expect(patch).toMatchObject({ name: "Renamed" });
  });

  it("401 unauthenticated on POST .../price", async () => {
    const { POST } = await import(TOOL_PRICE);
    const res = await POST(
      req("http://test/api/settings/sales-cost/tools/tool-1/price", "POST", { cost: 10000 }),
      { params: { id: "tool-1" } },
    );
    expect(res.status).toBe(401);
    expect(setToolPrice).not.toHaveBeenCalled();
  });

  it.each(DENIED_ROLES)("403 for %s on POST .../price and does not write", async (role) => {
    setSession({ userId: "u2", orgId: "org-1", role });
    const { POST } = await import(TOOL_PRICE);
    const res = await POST(
      req("http://test/api/settings/sales-cost/tools/tool-1/price", "POST", { cost: 10000 }),
      { params: { id: "tool-1" } },
    );
    expect(res.status).toBe(403);
    expect(setToolPrice).not.toHaveBeenCalled();
  });

  it("201 for an admin, opening a new version from the given month", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "org_admin" });
    const { POST } = await import(TOOL_PRICE);
    const res = await POST(
      req("http://test/api/settings/sales-cost/tools/tool-1/price", "POST", {
        cost: 10000,
        billingFrequency: "monthly",
        effectiveFrom: "2026-09",
      }),
      { params: { id: "tool-1" } },
    );

    expect(res.status).toBe(201);
    // The spec's example: ₹10,000 effective September, leaving August alone.
    expect(setToolPrice).toHaveBeenCalledWith(
      "org-1",
      "tool-1",
      expect.objectContaining({
        cost: 10000,
        billingFrequency: "monthly",
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
      }),
      "u1",
    );
  });

  it("400 on a negative price", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "Administrator" });
    const { POST } = await import(TOOL_PRICE);
    const res = await POST(
      req("http://test/api/settings/sales-cost/tools/tool-1/price", "POST", { cost: -1 }),
      { params: { id: "tool-1" } },
    );
    expect(res.status).toBe(400);
    expect(setToolPrice).not.toHaveBeenCalled();
  });

  it.each(DENIED_ROLES)("403 for %s deleting a price version", async (role) => {
    setSession({ userId: "u2", orgId: "org-1", role });
    const { DELETE } = await import(TOOL_PRICE_ITEM);
    const res = await DELETE(
      req("http://test/api/settings/sales-cost/tools/tool-1/price/price-1", "DELETE"),
      { params: { id: "tool-1", priceId: "price-1" } },
    );
    expect(res.status).toBe(403);
    expect(deleteToolPrice).not.toHaveBeenCalled();
  });

  it("scopes a price delete by org AND tool", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "Administrator" });
    const { DELETE } = await import(TOOL_PRICE_ITEM);
    const res = await DELETE(
      req("http://test/api/settings/sales-cost/tools/tool-1/price/price-1", "DELETE"),
      { params: { id: "tool-1", priceId: "price-1" } },
    );
    expect(res.status).toBe(200);
    expect(deleteToolPrice).toHaveBeenCalledWith("org-1", "tool-1", "price-1");
  });
});

describe("other-costs routes", () => {
  it.each(DENIED_ROLES)("403 for %s on POST", async (role) => {
    setSession({ userId: "u2", orgId: "org-1", role });
    const { POST } = await import(OTHER);
    const res = await POST(
      req("http://test/api/settings/sales-cost/other-costs", "POST", {
        userId: "rep-1",
        label: "Travel",
        monthlyAmount: 5000,
      }),
    );
    expect(res.status).toBe(403);
    expect(createOtherCost).not.toHaveBeenCalled();
  });

  it("201 for an admin, scoped to their org", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "administrator" });
    const { POST } = await import(OTHER);
    const res = await POST(
      req("http://test/api/settings/sales-cost/other-costs", "POST", {
        userId: "rep-1",
        label: "Travel",
        monthlyAmount: 5000,
        effectiveFrom: "2026-08",
      }),
    );
    expect(res.status).toBe(201);
    expect(createOtherCost).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ userId: "rep-1", label: "Travel", monthlyAmount: 5000 }),
      "u1",
    );
  });

  it("400 when the label is empty", async () => {
    setSession({ userId: "u1", orgId: "org-1", role: "Administrator" });
    const { POST } = await import(OTHER);
    const res = await POST(
      req("http://test/api/settings/sales-cost/other-costs", "POST", {
        userId: "rep-1",
        label: "   ",
        monthlyAmount: 5000,
      }),
    );
    expect(res.status).toBe(400);
    expect(createOtherCost).not.toHaveBeenCalled();
  });
});
