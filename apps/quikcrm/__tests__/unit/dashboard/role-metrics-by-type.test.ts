/**
 * FR-4.2 — activity counts sliced BY activity-type, tier-scoped.
 *
 * REAL RED→GREEN: the `activitiesByType` breakdown does not exist yet
 * (buildRoleMetrics returns scalar counts only; no crmActivity.groupBy call).
 *
 * Grouping key: CrmActivity.type (the string label). NOTE/FLAG: CrmActivity has
 * NO activityTypeId column — the only type-identifying field on the row is the
 * free-string `type` (set to the configured type's label by the logging UX). So
 * by-type slicing groups by that label. (code is unique per org; label is not
 * constrained — two same-labelled types would merge. Acceptable for v1.)
 *
 * Contract pinned: the by-type groupBy MUST reuse the SAME tier scope where-clause
 * FR-4.1 pinned (reuse, don't re-derive), and the DTO carries
 * activitiesByType: { type: string; count: number }[].
 *
 * Mock-level: prisma mocked; we assert the `where` passed to crmActivity.groupBy
 * matches the tier scope, and that the DTO surfaces the breakdown. Runtime
 * confirmation of SalesManager person-scoping is OWED (carried flag).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";

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

// crmActivity.groupBy is heavily overloaded; cast to a simple mock surface for
// the test (deep-mock typing doesn't expose mockResolvedValue/mock cleanly).
const groupByMock = prismaMock.crmActivity.groupBy as unknown as {
  mockResolvedValue: (v: unknown) => void;
  mock: { calls: unknown[][] };
};

// groupBy returns Prisma's shape: [{ type, _count: { _all } }]
function mockGroupBy(rows: Array<{ type: string; count: number }>) {
  groupByMock.mockResolvedValue(rows.map((r) => ({ type: r.type, _count: { _all: r.count } })));
}
function groupByWheres() {
  return groupByMock.mock.calls.map((c) => (c[0] as { where: unknown })?.where);
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.crmActivity.count.mockResolvedValue(0 as never);
  prismaMock.crmTask.count.mockResolvedValue(0 as never);
  prismaMock.crmLead.count.mockResolvedValue(0 as never);
  prismaMock.crmAccount.count.mockResolvedValue(0 as never);
  prismaMock.crmContact.count.mockResolvedValue(0 as never);
  prismaMock.crmQuote.count.mockResolvedValue(0 as never);
  prismaMock.crmOpportunity.count.mockResolvedValue(0 as never);
  prismaMock.crmOpportunity.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);
  prismaMock.crmOpportunity.findMany.mockResolvedValue([] as never);
  mockGroupBy([]);
});

describe("FR-4.2 — activitiesByType (tier-scoped, by CrmActivity.type)", () => {
  it("SalesUser → activitiesByType present, grouped within OWN scope ({ orgId, ownerId: userId })", async () => {
    vi.mocked(accountScopeFilter).mockResolvedValue(null);
    vi.mocked(getScope).mockResolvedValue({ unrestricted: false, allowedAccountIds: [], teamMemberIds: [] } as never);
    mockGroupBy([
      { type: "Upwork Connect", count: 5 },
      { type: "LinkedIn DM", count: 3 },
    ]);

    const res = await buildRoleMetrics(user("SalesUser"));

    // (a) groupBy reused the SAME own-scope where FR-4.1 pinned
    expect(groupByWheres()).toContainEqual({ orgId: "t1", ownerId: "u1" });
    // (b) DTO surfaces the breakdown
    const m = res.metrics as { activitiesByType?: { type: string; count: number }[] };
    expect(m.activitiesByType).toEqual([
      { type: "Upwork Connect", count: 5 },
      { type: "LinkedIn DM", count: 3 },
    ]);
  });

  it("Administrator → activitiesByType grouped org-wide ({ orgId })", async () => {
    vi.mocked(accountScopeFilter).mockResolvedValue(null);
    vi.mocked(getScope).mockResolvedValue({ unrestricted: true } as never);
    mockGroupBy([{ type: "Pitch Call", count: 9 }]);

    const res = await buildRoleMetrics(user("Administrator"));

    expect(groupByWheres()).toContainEqual({ orgId: "t1" });
    const m = res.metrics as { activitiesByType?: { type: string; count: number }[] };
    expect(m.activitiesByType).toEqual([{ type: "Pitch Call", count: 9 }]);
  });

  it("SalesManager → activitiesByType grouped PERSON-scoped ({ orgId, ownerId: { in: memberIds } })", async () => {
    // FLAG: code-verified, runtime-confirmation OWED.
    vi.mocked(accountScopeFilter).mockResolvedValue({ accountId: { in: ["acc1"] } } as never);
    vi.mocked(getScope).mockResolvedValue({ unrestricted: false, allowedAccountIds: ["acc1"], teamMemberIds: [] } as never);
    vi.mocked(resolveManagerTeam).mockResolvedValue({ memberIds: ["m1", "m2"], memberNames: [], size: 2 } as never);
    mockGroupBy([{ type: "Upwork Connect", count: 7 }]);

    const res = await buildRoleMetrics(user("SalesManager"));

    expect(groupByWheres()).toContainEqual({ orgId: "t1", ownerId: { in: ["m1", "m2"] } });
    const m = res.metrics as { activitiesByType?: { type: string; count: number }[] };
    expect(m.activitiesByType).toEqual([{ type: "Upwork Connect", count: 7 }]);
  });
});
