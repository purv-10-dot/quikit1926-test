/**
 * Unit tests for lib/services/dashboard/role-metrics.ts
 *
 * Validates that each role builder:
 *   1. Uses the correct ACL helpers (accountScopeFilter / getScope)
 *   2. Passes the right WHERE arguments to Prisma
 *   3. Shows / hides the correct metric categories per role
 *   4. Dashboard counts would match module counts (same filter composition)
 *
 * Audited findings documented inline:
 *   ✅ buildAdminMetrics     — org-wide, no ACL (correct for Admin)
 *   ✅ buildSalesManagerMetrics — accountScopeFilter + resolveManagerTeam
 *   ✅ buildSalesUserMetrics — accountScopeFilter + ownerId:userId
 *   FIX buildMarketingMetrics — lead counts now use accountScopeFilter
 *   FIX buildFinanceMetrics  — opp/quote counts now use accountScopeFilter/getScope
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock, dbMock, resetPrismaUnitMocks } from "../../helpers/prisma-unit-mock";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Spy on the ACL helpers so we can verify they are called and capture their
// return values without going through the full Prisma mock dance.
const mockAccountScopeFilter = vi.fn();
const mockGetScope = vi.fn();
vi.mock("@/lib/auth/account-acl", () => ({
  accountScopeFilter: (...args: unknown[]) => mockAccountScopeFilter(...args),
  getScope: (...args: unknown[]) => mockGetScope(...args),
}));

const mockResolveManagerTeam = vi.fn();
vi.mock("@/lib/services/dashboard/team", () => ({
  resolveManagerTeam: (...args: unknown[]) => mockResolveManagerTeam(...args),
}));

vi.mock("@/lib/services/dashboard/currency", () => ({
  formatINR: (v: number) => `₹${v}`,
}));

import { buildRoleMetrics } from "@/lib/services/dashboard/role-metrics";
import type { SessionUser } from "@/types/permission";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_USER = (role: string): SessionUser => ({
  userId: "u-1",
  orgId: "org-1",
  role,
  email: "user@example.com",
  name: "Test User",
});

const RESTRICTED_SCOPE = {
  unrestricted: false,
  allowedAccountIds: ["acc-A", "acc-B"],
} as const;

const EMPTY_SCOPE = {
  unrestricted: false,
  allowedAccountIds: [],
} as const;

const ACL_FILTER = {
  OR: [
    { accountId: { in: ["acc-A", "acc-B"] } },
    { accountId: null, ownerId: "u-1" },
  ],
} as const;

// Helper: default all Prisma mocks to safe zero values
function resetPrismaMocks() {
  prismaMock.crmLead.count.mockResolvedValue(0);
  prismaMock.crmAccount.count.mockResolvedValue(0);
  prismaMock.crmContact.count.mockResolvedValue(0);
  prismaMock.crmOpportunity.count.mockResolvedValue(0);
  prismaMock.crmOpportunity.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
  prismaMock.crmOpportunity.findMany.mockResolvedValue([] as never);
  prismaMock.crmActivity.count.mockResolvedValue(0);
  prismaMock.crmTask.count.mockResolvedValue(0);
  prismaMock.crmQuote.count.mockResolvedValue(0);
  prismaMock.crmCampaign.count.mockResolvedValue(0);
  // groupBy has a complex overloaded type that vitest-mock-extended doesn't fully infer
  (prismaMock.crmLead.groupBy as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([] as never);
  // FR-4.2: buildRoleMetrics now also calls crmActivity.groupBy (activitiesByType
  // slice). Stub it so the builders run to completion — this suite asserts the
  // count where-clauses, not the by-type shape.
  (prismaMock.crmActivity.groupBy as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([] as never);
  prismaMock.crmSalesGroupManager.findMany.mockResolvedValue([] as never);
  prismaMock.crmSalesGroupMember.findMany.mockResolvedValue([] as never);
  dbMock.user.findMany.mockResolvedValue([] as never);
  dbMock.orgMember.findMany.mockResolvedValue([] as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPrismaUnitMocks(); // resets call history for deep mock methods
  resetPrismaMocks();    // sets safe zero-value defaults for each test
});

// ── Administrator ─────────────────────────────────────────────────────────────

describe("buildAdminMetrics (Administrator)", () => {
  it("does NOT call accountScopeFilter — admin is unrestricted", async () => {
    await buildRoleMetrics(BASE_USER("Administrator"));
    expect(mockAccountScopeFilter).not.toHaveBeenCalled();
    expect(mockGetScope).not.toHaveBeenCalled();
  });

  it("returns all 8 required metric fields", async () => {
    prismaMock.crmLead.count.mockResolvedValue(10);
    prismaMock.crmAccount.count.mockResolvedValue(5);
    prismaMock.crmContact.count.mockResolvedValue(3);
    prismaMock.crmOpportunity.count.mockResolvedValue(8);
    prismaMock.crmOpportunity.aggregate.mockResolvedValue({ _sum: { amount: 100000 } } as never);
    prismaMock.crmActivity.count.mockResolvedValue(20);
    prismaMock.crmTask.count.mockResolvedValue(7);
    prismaMock.crmQuote.count.mockResolvedValue(4);

    const result = await buildRoleMetrics(BASE_USER("Administrator"));
    expect(result.role).toBe("Administrator");
    if (result.role !== "Administrator") throw new Error("unreachable");
    expect(result.metrics.totalLeads).toBe(10);
    expect(result.metrics.totalAccounts).toBe(5);
    expect(result.metrics.totalContacts).toBe(3);
    expect(result.metrics.totalOpportunities).toBe(8);
    expect(result.metrics.totalActivities).toBe(20);
    expect(result.metrics.totalTasks).toBe(7);
    expect(result.metrics.totalQuotes).toBe(4);
  });

  it("queries include orgId and deletedAt:null but no ownerId restriction", async () => {
    await buildRoleMetrics(BASE_USER("Administrator"));
    const leadArgs = prismaMock.crmLead.count.mock.calls[0]?.[0];
    expect(leadArgs?.where).toMatchObject({ orgId: "org-1", deletedAt: null });
    expect(leadArgs?.where).not.toHaveProperty("ownerId");
  });
});

// ── Sales Manager ─────────────────────────────────────────────────────────────

describe("buildSalesManagerMetrics (SalesManager)", () => {
  beforeEach(() => {
    mockAccountScopeFilter.mockResolvedValue(ACL_FILTER);
    mockGetScope.mockResolvedValue(RESTRICTED_SCOPE);
    mockResolveManagerTeam.mockResolvedValue({
      memberIds: ["u-member1"],
      memberNames: ["Alice Smith"],
      size: 1,
    });
  });

  it("calls accountScopeFilter with the user session", async () => {
    await buildRoleMetrics(BASE_USER("SalesManager"));
    expect(mockAccountScopeFilter).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-1", orgId: "org-1", role: "SalesManager" }),
    );
  });

  it("passes aclFilter to lead count query (same as /api/leads)", async () => {
    await buildRoleMetrics(BASE_USER("SalesManager"));
    const leadCall = prismaMock.crmLead.count.mock.calls[0]?.[0];
    // Should be AND-merged with the ACL filter
    expect(JSON.stringify(leadCall?.where)).toContain("acc-A");
  });

  it("uses resolveManagerTeam for activity / task counts", async () => {
    await buildRoleMetrics(BASE_USER("SalesManager"));
    expect(mockResolveManagerTeam).toHaveBeenCalled();
    const actCall = prismaMock.crmActivity.count.mock.calls[0]?.[0];
    expect(actCall?.where).toMatchObject({ ownerId: { in: ["u-member1"] } });
  });

  it("returns all 10 required SalesManager metric fields", async () => {
    const result = await buildRoleMetrics(BASE_USER("SalesManager"));
    expect(result.role).toBe("SalesManager");
    if (result.role !== "SalesManager") throw new Error("unreachable");
    const m = result.metrics;
    expect(m).toHaveProperty("teamLeads");
    expect(m).toHaveProperty("teamOpportunities");
    expect(m).toHaveProperty("teamRevenue");
    expect(m).toHaveProperty("teamActivities");
    expect(m).toHaveProperty("teamTasks");
    expect(m).toHaveProperty("teamQuotes");
    expect(m).toHaveProperty("teamPipeline");
    expect(m).toHaveProperty("teamMemberCount");
    // Absence of admin fields
    expect(m).not.toHaveProperty("totalLeads");
    expect(m).not.toHaveProperty("totalAccounts");
  });

  // Regression: before the short-circuit removal a SalesManager with no group
  // accounts got teamLeads:0 from the dashboard even though the Leads module
  // correctly showed the manager's own unattached (accountId:null) leads.
  it("manager with empty scope (no group accounts) still counts own unattached leads", async () => {
    const EMPTY_ACL_FILTER = {
      OR: [
        { accountId: { in: [] } },
        { accountId: null, ownerId: "u-1" },
      ],
    };
    mockGetScope.mockResolvedValue(EMPTY_SCOPE);
    mockAccountScopeFilter.mockResolvedValue(EMPTY_ACL_FILTER);
    mockResolveManagerTeam.mockResolvedValue({ memberIds: [], memberNames: [], size: 0 });

    // The DB returns 2 leads matching accountId:null + ownerId:"u-1"
    prismaMock.crmLead.count.mockResolvedValue(2);

    const result = await buildRoleMetrics(BASE_USER("SalesManager"));
    expect(result.role).toBe("SalesManager");
    if (result.role !== "SalesManager") throw new Error("unreachable");

    // teamLeads must NOT be hard-coded 0 — it must use the lead count query
    expect(result.metrics.teamLeads).toBe(2);

    // The lead count query must have been issued with the aclFilter applied
    const leadCall = prismaMock.crmLead.count.mock.calls[0]?.[0];
    expect(JSON.stringify(leadCall?.where)).toContain('"accountId":null');
    expect(JSON.stringify(leadCall?.where)).toContain('"ownerId":"u-1"');
  });

  it("manager with empty scope gets own activities (not hard-coded 0)", async () => {
    mockGetScope.mockResolvedValue(EMPTY_SCOPE);
    mockAccountScopeFilter.mockResolvedValue({
      OR: [{ accountId: { in: [] } }, { accountId: null, ownerId: "u-1" }],
    });
    mockResolveManagerTeam.mockResolvedValue({ memberIds: [], memberNames: [], size: 0 });

    prismaMock.crmActivity.count.mockResolvedValue(3);

    const result = await buildRoleMetrics(BASE_USER("SalesManager"));
    if (result.role !== "SalesManager") throw new Error("unreachable");

    // With memberIds empty the normal path falls back to manager's own activities
    expect(result.metrics.teamActivities).toBe(3);
    const actCall = prismaMock.crmActivity.count.mock.calls[0]?.[0];
    expect(actCall?.where).toMatchObject({ orgId: "org-1", ownerId: "u-1" });
  });
});

// ── Sales User ────────────────────────────────────────────────────────────────

describe("buildSalesUserMetrics (SalesUser)", () => {
  beforeEach(() => {
    mockAccountScopeFilter.mockResolvedValue(ACL_FILTER);
    mockGetScope.mockResolvedValue(RESTRICTED_SCOPE);
  });

  it("calls accountScopeFilter with the user session", async () => {
    await buildRoleMetrics(BASE_USER("SalesUser"));
    expect(mockAccountScopeFilter).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-1", role: "SalesUser" }),
    );
  });

  it("lead count query includes ownerId: userId (own data only)", async () => {
    await buildRoleMetrics(BASE_USER("SalesUser"));
    const leadCall = prismaMock.crmLead.count.mock.calls[0]?.[0];
    expect(JSON.stringify(leadCall?.where)).toContain('"ownerId":"u-1"');
  });

  it("activity count uses ownerId:userId not team members", async () => {
    await buildRoleMetrics(BASE_USER("SalesUser"));
    const actCall = prismaMock.crmActivity.count.mock.calls[0]?.[0];
    expect(actCall?.where).toMatchObject({ orgId: "org-1", ownerId: "u-1" });
  });

  it("returns only SalesUser metric fields (no admin or manager fields)", async () => {
    const result = await buildRoleMetrics(BASE_USER("SalesUser"));
    expect(result.role).toBe("SalesUser");
    if (result.role !== "SalesUser") throw new Error("unreachable");
    const m = result.metrics;
    expect(m).toHaveProperty("myLeads");
    expect(m).toHaveProperty("myOpportunities");
    expect(m).toHaveProperty("myRevenue");
    expect(m).toHaveProperty("myActivities");
    expect(m).toHaveProperty("myTasks");
    expect(m).toHaveProperty("myQuotes");
    expect(m).not.toHaveProperty("totalAccounts");
    expect(m).not.toHaveProperty("teamLeads");
  });
});

// ── Marketing User ────────────────────────────────────────────────────────────

describe("buildMarketingMetrics (MarketingUser) — ACL fix", () => {
  beforeEach(() => {
    mockAccountScopeFilter.mockResolvedValue(ACL_FILTER);
    mockGetScope.mockResolvedValue(RESTRICTED_SCOPE);
  });

  it("calls accountScopeFilter so lead counts match /api/leads", async () => {
    await buildRoleMetrics(BASE_USER("MarketingUser"));
    expect(mockAccountScopeFilter).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-1", role: "MarketingUser" }),
    );
  });

  it("lead count passes aclFilter (not org-wide)", async () => {
    await buildRoleMetrics(BASE_USER("MarketingUser"));
    const leadCountCall = prismaMock.crmLead.count.mock.calls[0]?.[0];
    const serialized = JSON.stringify(leadCountCall?.where);
    // Must contain the scoped account IDs, not just { orgId }
    expect(serialized).toContain("acc-A");
  });

  it("groupBy (lead sources) passes aclFilter", async () => {
    await buildRoleMetrics(BASE_USER("MarketingUser"));
    const groupByCall = (prismaMock.crmLead.groupBy as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const serialized = JSON.stringify(groupByCall?.where);
    expect(serialized).toContain("acc-A");
  });

  it("campaign counts remain org-wide (campaigns have no accountId)", async () => {
    await buildRoleMetrics(BASE_USER("MarketingUser"));
    const campaignCalls = prismaMock.crmCampaign.count.mock.calls;
    expect(campaignCalls.length).toBeGreaterThanOrEqual(1);
    // Campaign where should only have orgId, no account filter
    const firstCampaignWhere = campaignCalls[0]?.[0]?.where;
    expect(firstCampaignWhere).toMatchObject({ orgId: "org-1" });
    expect(JSON.stringify(firstCampaignWhere)).not.toContain("acc-A");
  });

  it("does NOT expose revenue, opportunities, quotes, or sales activities", async () => {
    const result = await buildRoleMetrics(BASE_USER("MarketingUser"));
    if (result.role !== "MarketingUser") throw new Error("unreachable");
    const m = result.metrics;
    expect(m).not.toHaveProperty("totalRevenue");
    expect(m).not.toHaveProperty("totalOpportunities");
    expect(m).not.toHaveProperty("totalQuotes");
    expect(m).not.toHaveProperty("totalActivities");
  });

  it("returns all required Marketing metric fields", async () => {
    const result = await buildRoleMetrics(BASE_USER("MarketingUser"));
    if (result.role !== "MarketingUser") throw new Error("unreachable");
    const m = result.metrics;
    expect(m).toHaveProperty("totalCampaigns");
    expect(m).toHaveProperty("activeCampaigns");
    expect(m).toHaveProperty("marketingLeads");
    expect(m).toHaveProperty("leadSources");
    expect(m).toHaveProperty("conversionRate");
  });

  it("conversionRate is null when no ACL-scoped leads exist", async () => {
    mockAccountScopeFilter.mockResolvedValue({
      OR: [{ accountId: { in: [] } }, { accountId: null, ownerId: "u-1" }],
    });
    // All lead counts return 0
    prismaMock.crmLead.count.mockResolvedValue(0);
    const result = await buildRoleMetrics(BASE_USER("MarketingUser"));
    if (result.role !== "MarketingUser") throw new Error("unreachable");
    expect(result.metrics.conversionRate).toBeNull();
  });

  it("Marketing user with no ACL config gets empty scope — marketingLeads = 0", async () => {
    // After the unrestricted-fallback removal, no-ACL → empty scope
    mockAccountScopeFilter.mockResolvedValue({
      OR: [{ accountId: { in: [] } }, { accountId: null, ownerId: "u-1" }],
    });
    prismaMock.crmLead.count.mockResolvedValue(0);
    const result = await buildRoleMetrics(BASE_USER("MarketingUser"));
    if (result.role !== "MarketingUser") throw new Error("unreachable");
    expect(result.metrics.marketingLeads).toBe(0);
  });
});

// ── Finance User ──────────────────────────────────────────────────────────────

describe("buildFinanceMetrics (FinanceUser) — ACL fix", () => {
  beforeEach(() => {
    mockAccountScopeFilter.mockResolvedValue(ACL_FILTER);
    mockGetScope.mockResolvedValue(RESTRICTED_SCOPE);
  });

  it("calls accountScopeFilter and getScope (both required)", async () => {
    await buildRoleMetrics(BASE_USER("FinanceUser"));
    expect(mockAccountScopeFilter).toHaveBeenCalledWith(
      expect.objectContaining({ role: "FinanceUser" }),
    );
    expect(mockGetScope).toHaveBeenCalledWith(
      expect.objectContaining({ role: "FinanceUser" }),
    );
  });

  it("opportunity aggregate passes aclFilter (not org-wide)", async () => {
    await buildRoleMetrics(BASE_USER("FinanceUser"));
    const aggCall = prismaMock.crmOpportunity.aggregate.mock.calls[0]?.[0];
    expect(JSON.stringify(aggCall?.where)).toContain("acc-A");
  });

  it("quote count uses accountId: { in: allowedAccountIds }", async () => {
    await buildRoleMetrics(BASE_USER("FinanceUser"));
    const quoteCall = prismaMock.crmQuote.count.mock.calls[0]?.[0];
    expect(quoteCall?.where).toMatchObject({
      orgId: "org-1",
      deletedAt: null,
      accountId: { in: ["acc-A", "acc-B"] },
    });
  });

  it("wonDeals count uses same aclFilter as revenue aggregate (no double counting)", async () => {
    await buildRoleMetrics(BASE_USER("FinanceUser"));
    // Both crmOpportunity.aggregate and crmOpportunity.count should include acc-A
    const wonCountCall = prismaMock.crmOpportunity.count.mock.calls[0]?.[0];
    expect(JSON.stringify(wonCountCall?.where)).toContain("acc-A");
  });

  it("quote count is org-wide when scope is unrestricted (Admin path)", async () => {
    mockGetScope.mockResolvedValue({ unrestricted: true });
    mockAccountScopeFilter.mockResolvedValue(null); // unrestricted → null

    await buildRoleMetrics(BASE_USER("FinanceUser"));
    const quoteCall = prismaMock.crmQuote.count.mock.calls[0]?.[0];
    expect(quoteCall?.where).toMatchObject({ orgId: "org-1", deletedAt: null });
    expect(quoteCall?.where).not.toHaveProperty("accountId");
  });

  it("does NOT expose lead activities, sales tasks, or campaign metrics", async () => {
    const result = await buildRoleMetrics(BASE_USER("FinanceUser"));
    if (result.role !== "FinanceUser") throw new Error("unreachable");
    const m = result.metrics;
    expect(m).not.toHaveProperty("totalActivities");
    expect(m).not.toHaveProperty("totalTasks");
    expect(m).not.toHaveProperty("totalCampaigns");
    expect(m).not.toHaveProperty("marketingLeads");
  });

  it("returns all required Finance metric fields", async () => {
    prismaMock.crmOpportunity.aggregate.mockResolvedValue({
      _sum: { amount: 500000 },
    } as never);
    prismaMock.crmOpportunity.findMany.mockResolvedValue([
      { amount: 200000, probability: 50 },
    ] as never);
    prismaMock.crmQuote.count.mockResolvedValue(3);
    prismaMock.crmOpportunity.count.mockResolvedValue(2);

    const result = await buildRoleMetrics(BASE_USER("FinanceUser"));
    if (result.role !== "FinanceUser") throw new Error("unreachable");
    const m = result.metrics;
    expect(m.totalRevenue).toBe(500000);
    expect(m.forecastRevenue).toBe(100000); // 200000 * 0.5
    expect(m.totalOpportunities).toBe(1); // length of openOpps array
    expect(m.totalQuotes).toBe(3);
    expect(m.wonDeals).toBe(2);
  });

  it("Finance user with empty scope sees 0 revenue (no ACL bypass)", async () => {
    mockGetScope.mockResolvedValue(EMPTY_SCOPE);
    mockAccountScopeFilter.mockResolvedValue({
      OR: [{ accountId: { in: [] } }, { accountId: null, ownerId: "u-1" }],
    });
    prismaMock.crmOpportunity.aggregate.mockResolvedValue({ _sum: { amount: 0 } } as never);
    prismaMock.crmOpportunity.findMany.mockResolvedValue([] as never);
    prismaMock.crmOpportunity.count.mockResolvedValue(0);
    prismaMock.crmQuote.count.mockResolvedValue(0);

    const result = await buildRoleMetrics(BASE_USER("FinanceUser"));
    if (result.role !== "FinanceUser") throw new Error("unreachable");
    expect(result.metrics.totalRevenue).toBe(0);
    expect(result.metrics.totalQuotes).toBe(0);
  });
});

// ── Dispatcher routing ────────────────────────────────────────────────────────

describe("buildRoleMetrics dispatcher", () => {
  beforeEach(() => {
    mockAccountScopeFilter.mockResolvedValue(null); // unrestricted for simplicity
    mockGetScope.mockResolvedValue({ unrestricted: true });
    mockResolveManagerTeam.mockResolvedValue(null);
  });

  it.each([
    ["Administrator", "Administrator"],
    ["SalesManager", "SalesManager"],
    ["SalesUser", "SalesUser"],
    ["MarketingUser", "MarketingUser"],
    ["FinanceUser", "FinanceUser"],
  ])("role %s → dto.role = %s", async (inputRole, expectedRole) => {
    const result = await buildRoleMetrics(BASE_USER(inputRole));
    expect(result.role).toBe(expectedRole);
  });

  it("unknown role falls through to SalesUser (most restricted)", async () => {
    const result = await buildRoleMetrics(BASE_USER("UnknownRole"));
    expect(result.role).toBe("SalesUser");
  });
});
