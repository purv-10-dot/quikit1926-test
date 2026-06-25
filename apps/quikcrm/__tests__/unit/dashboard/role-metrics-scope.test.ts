/**
 * FR-4.1 — CHARACTERIZATION test (pins CURRENT behavior; expected to PASS on
 * first run — NOT a RED→GREEN). It locks the 3 live RBAC scoping tiers in
 * buildRoleMetrics so that FR-4.2 (by-type) and FR-4.3 (by-custom-field-value)
 * cannot silently regress the scope where-clauses they will extend.
 *
 * If any assertion FAILS on first run, that is a real discrepancy between the
 * documented scoping and the code — a finding to report, not a RED to "fix".
 *
 * Tiers pinned (the 3 confirmed-live ones; TeamManager/team-tables excluded):
 *   - Administrator → org-wide: activities where = { orgId } (no scope filter).
 *   - SalesManager  → activities PERSON-scoped: { orgId, ownerId: { in: memberIds } }
 *                     (memberIds from resolveManagerTeam — group members);
 *                     leads/opps get accountScopeFilter AND'd on.
 *                     [FLAG: code-verified, runtime-confirmation OWED.]
 *   - SalesUser     → own: activities where = { orgId, ownerId: userId },
 *                     plus accountScopeFilter on leads/opps.
 *
 * Mock-level: prisma is mocked (we assert the `where` passed to crmActivity.count),
 * and the acl/team seams are stubbed to control scope deterministically.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";

// Control the scope seams so the where-clauses are deterministic.
vi.mock("@/lib/auth/account-acl", () => ({
  accountScopeFilter: vi.fn(),
  getScope: vi.fn(),
}));
vi.mock("@/lib/services/dashboard/team", () => ({ resolveManagerTeam: vi.fn() }));
vi.mock("@/lib/services/teams/team-scope", () => ({ resolveTeamScope: vi.fn() }));

import { accountScopeFilter, getScope } from "@/lib/auth/account-acl";
import { resolveManagerTeam } from "@/lib/services/dashboard/team";
import { buildRoleMetrics } from "@/lib/services/dashboard/role-metrics";

function user(role: string) {
  return { userId: "u1", orgId: "t1", role, email: "u@x.co", name: "U" } as never;
}

// Find the `where` passed to crmActivity.count (the activity scope under test).
function activityCountWheres() {
  return prismaMock.crmActivity.count.mock.calls.map((c) => (c[0] as { where: unknown })?.where);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Every prisma count/aggregate/findMany resolves to a benign value so the
  // builders run to completion; we only inspect the `where` args.
  prismaMock.crmActivity.count.mockResolvedValue(0 as never);
  // buildRoleMetrics now also calls crmActivity.groupBy (FR-4.2 by-type slice);
  // stub it so the builders run to completion. This test still only asserts the
  // count where-clauses (the scope contract) — groupBy shape is FR-4.2's test.
  (prismaMock.crmActivity.groupBy as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([]);
  prismaMock.crmTask.count.mockResolvedValue(0 as never);
  prismaMock.crmLead.count.mockResolvedValue(0 as never);
  prismaMock.crmAccount.count.mockResolvedValue(0 as never);
  prismaMock.crmContact.count.mockResolvedValue(0 as never);
  prismaMock.crmQuote.count.mockResolvedValue(0 as never);
  prismaMock.crmOpportunity.count.mockResolvedValue(0 as never);
  prismaMock.crmOpportunity.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
  prismaMock.crmOpportunity.findMany.mockResolvedValue([] as never);
});

describe("FR-4.1 — buildRoleMetrics scoping contract (characterization)", () => {
  it("Administrator → activities scoped org-wide ({ orgId }), no scope filter", async () => {
    vi.mocked(accountScopeFilter).mockResolvedValue(null); // admin = unrestricted
    vi.mocked(getScope).mockResolvedValue({ unrestricted: true } as never);

    const res = await buildRoleMetrics(user("Administrator"));
    expect(res.role).toBe("Administrator");
    // the activity count where is exactly { orgId } — org-wide
    expect(activityCountWheres()).toContainEqual({ orgId: "t1" });
  });

  it("SalesUser → activities scoped to own ({ orgId, ownerId: userId })", async () => {
    vi.mocked(accountScopeFilter).mockResolvedValue(null);
    vi.mocked(getScope).mockResolvedValue({
      unrestricted: false,
      allowedAccountIds: [],
      teamMemberIds: [],
    } as never);

    const res = await buildRoleMetrics(user("SalesUser"));
    expect(res.role).toBe("SalesUser");
    expect(activityCountWheres()).toContainEqual({ orgId: "t1", ownerId: "u1" });
  });

  it("SalesManager → activities PERSON-scoped by group members ({ orgId, ownerId: { in: memberIds } })", async () => {
    // FLAG: this scoping is code-verified; runtime confirmation OWED.
    vi.mocked(accountScopeFilter).mockResolvedValue({ accountId: { in: ["acc1"] } } as never);
    vi.mocked(getScope).mockResolvedValue({
      unrestricted: false,
      allowedAccountIds: ["acc1"],
      teamMemberIds: [],
    } as never);
    vi.mocked(resolveManagerTeam).mockResolvedValue({
      memberIds: ["m1", "m2"],
      memberNames: [],
      size: 2,
    } as never);

    const res = await buildRoleMetrics(user("SalesManager"));
    expect(res.role).toBe("SalesManager");
    // activities are person-scoped to the group's member ids, NOT account-scoped
    expect(activityCountWheres()).toContainEqual({ orgId: "t1", ownerId: { in: ["m1", "m2"] } });
  });

  it("SalesManager with NO resolved team → activities fall back to own ({ orgId, ownerId: userId })", async () => {
    vi.mocked(accountScopeFilter).mockResolvedValue(null);
    vi.mocked(getScope).mockResolvedValue({
      unrestricted: false,
      allowedAccountIds: [],
      teamMemberIds: [],
    } as never);
    vi.mocked(resolveManagerTeam).mockResolvedValue(null as never);

    const res = await buildRoleMetrics(user("SalesManager"));
    expect(res.role).toBe("SalesManager");
    // empty memberIds → own-only fallback (current behavior)
    expect(activityCountWheres()).toContainEqual({ orgId: "t1", ownerId: "u1" });
  });
});
