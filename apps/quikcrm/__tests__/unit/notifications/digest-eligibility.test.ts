/**
 * Recipient feature — Stage 1: digest eligibility helper (RED→GREEN).
 *
 * isDigestEligible decides WHO can be a digest recipient. Used in BOTH the read
 * API (render toggle enabled/disabled + reason tooltip), the write API (reject
 * ineligible toggles), and digest-run (defense-in-depth at send). ONE source.
 *
 * Rules (spec 2026-06-25):
 *   - Administrator                              → eligible
 *   - SalesManager who OWNS ≥1 group (CrmSalesGroupManager row in org) → eligible
 *   - SalesManager with NO group                 → ineligible, reason "no-team"
 *   - SalesUser / Marketing / Finance / other    → ineligible, reason "not-eligible-role"
 *
 * Scope is by actual role (Admin org-wide, SalesManager their team) — NOT stored.
 * Eligibility uses the SHIPPED CrmSalesGroupManager table (mirrors
 * resolveManagerTeam's org-via-join filter); NO CrmUserAppRole dependency.
 *
 * Module does not exist yet → RED.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";
import { isDigestEligible } from "@/lib/services/notifications/digest-eligibility";

const managedFindMany = prismaMock.crmSalesGroupManager.findMany as unknown as {
  mockResolvedValue: (v: unknown) => void;
};

function u(role: string, userId = "u1", orgId = "org1") {
  return { userId, orgId, role };
}

beforeEach(() => {
  vi.clearAllMocks();
  managedFindMany.mockResolvedValue([]);
});

describe("isDigestEligible — Stage 1 (Phase 5 recipient feature)", () => {
  it("Administrator → eligible (no group query needed)", async () => {
    const res = await isDigestEligible(u("Administrator"));
    expect(res.eligible).toBe(true);
    expect(res.reason).toBeUndefined();
    // admins are eligible regardless of group ownership — must not depend on the query
    expect(prismaMock.crmSalesGroupManager.findMany).not.toHaveBeenCalled();
  });

  it("SalesManager who owns ≥1 group in the org → eligible", async () => {
    managedFindMany.mockResolvedValue([{ groupId: "g1", group: { orgId: "org1" } }]);
    const res = await isDigestEligible(u("SalesManager"));
    expect(res.eligible).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it("SalesManager with NO group → ineligible, reason 'no-team'", async () => {
    managedFindMany.mockResolvedValue([]);
    const res = await isDigestEligible(u("SalesManager"));
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe("no-team");
  });

  it("SalesManager whose only groups are in ANOTHER org → ineligible (org-scoped, 'no-team')", async () => {
    // org-via-join filter must exclude cross-org groups (mirrors resolveManagerTeam)
    managedFindMany.mockResolvedValue([{ groupId: "gX", group: { orgId: "other-org" } }]);
    const res = await isDigestEligible(u("SalesManager"));
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe("no-team");
  });

  it("SalesUser → ineligible, reason 'not-eligible-role'", async () => {
    const res = await isDigestEligible(u("SalesUser"));
    expect(res.eligible).toBe(false);
    expect(res.reason).toBe("not-eligible-role");
    expect(prismaMock.crmSalesGroupManager.findMany).not.toHaveBeenCalled();
  });

  it("MarketingUser / FinanceUser / unknown → ineligible 'not-eligible-role'", async () => {
    for (const role of ["MarketingUser", "FinanceUser", "whatever"]) {
      const res = await isDigestEligible(u(role));
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe("not-eligible-role");
    }
  });
});
