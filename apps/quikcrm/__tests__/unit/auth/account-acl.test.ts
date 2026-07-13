/**
 * Unit tests for lib/auth/account-acl.ts
 *
 * Covers:
 *   getScope           — role-based scope resolution (strict: no unrestricted fallback)
 *   accountScopeFilter — Prisma WHERE fragment returned for restricted users
 *   assertAccountAccess — throws 403 when account not in scope
 *
 * Regression scenarios (Lead A / B / C from spec):
 *   Lead A  ownerId=Admin,   accountId=null → Admin✅  SalesManager❌  SalesUser❌
 *   Lead B  ownerId=Manager, accountId=null → Admin✅  SalesManager✅  SalesUser❌
 *   Lead C  ownerId=SalesU,  accountId=null → Admin✅  SalesManager❌  SalesUser✅
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, resetPrismaUnitMocks } from "../../helpers/prisma-unit-mock";

// resolveTeamScope issues a raw `$queryRaw` the deep Prisma mock can't fulfill
// (it returns undefined, so the `.catch` inside throws). These ACL tests never
// set up team data, so stub it to "no managed teams" (null) — keeping the suite
// focused on account/owner scope resolution.
vi.mock("@/lib/services/teams/team-scope", () => ({
  resolveTeamScope: vi.fn().mockResolvedValue(null),
}));

import { getScope, accountScopeFilter, assertAccountAccess } from "@/lib/auth/account-acl";
import type { SessionUser } from "@/types/permission";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ADMIN: SessionUser = {
  userId: "u-admin",
  orgId: "org1",
  role: "Administrator",
  email: "admin@example.com",
  name: "Admin",
};

const MANAGER: SessionUser = {
  userId: "u-manager",
  orgId: "org1",
  role: "SalesManager",
  email: "mgr@example.com",
  name: "Manager",
};

const SALES: SessionUser = {
  userId: "u-sales",
  orgId: "org1",
  role: "SalesUser",
  email: "sales@example.com",
  name: "Sales Rep",
};

beforeEach(() => {
  // Full reset (not just clearAllMocks) so any unconsumed mockResolvedValueOnce
  // queue entries from a prior test don't bleed into the next one.
  resetPrismaUnitMocks();
  vi.clearAllMocks();
});

// ─── getScope ────────────────────────────────────────────────────────────────

describe("getScope", () => {
  it("Administrator → unrestricted: true without any DB queries", async () => {
    const scope = await getScope(ADMIN);
    expect(scope).toEqual({ unrestricted: true });
    expect(prismaMock.crmUserAccountAccess.findMany).not.toHaveBeenCalled();
  });

  it("non-admin with direct account access → restricted with that account", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([
      { accountId: "acc-1" },
    ] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const scope = await getScope(SALES);
    expect(scope).toEqual({ unrestricted: false, allowedAccountIds: ["acc-1"], teamMemberIds: [] });
  });

  it("non-admin with group membership → restricted with group accounts", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([
      { groupId: "grp-1" },
    ] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupAccount.findMany.mockResolvedValueOnce([
      { accountId: "acc-grp" },
    ] as never);

    const scope = await getScope(SALES);
    expect(scope).toEqual({ unrestricted: false, allowedAccountIds: ["acc-grp"], teamMemberIds: [] });
  });

  it("merges direct + group accounts, deduplicates", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([
      { accountId: "acc-direct" },
      { accountId: "acc-shared" },
    ] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([
      { groupId: "grp-1" },
    ] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupAccount.findMany.mockResolvedValueOnce([
      { accountId: "acc-grp" },
      { accountId: "acc-shared" }, // duplicate — should appear only once
    ] as never);

    const scope = await getScope(SALES);
    expect(scope.unrestricted).toBe(false);
    if (scope.unrestricted) throw new Error("unreachable");
    expect(scope.allowedAccountIds).toHaveLength(3);
    expect(scope.allowedAccountIds).toContain("acc-direct");
    expect(scope.allowedAccountIds).toContain("acc-shared");
    expect(scope.allowedAccountIds).toContain("acc-grp");
  });

  // ── Key regression: the old "no ACL → unrestricted" fallback is gone ────────
  it("non-admin with NO ACL rows AND NO group membership → restricted with empty list (not unrestricted)", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const scope = await getScope(SALES);
    // Must NOT fall back to unrestricted: true
    expect(scope).toEqual({ unrestricted: false, allowedAccountIds: [], teamMemberIds: [] });
  });

  it("SalesManager with no groups → restricted with empty list (not unrestricted)", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const scope = await getScope(MANAGER);
    expect(scope).toEqual({ unrestricted: false, allowedAccountIds: [], teamMemberIds: [] });
  });
});

// ─── accountScopeFilter ──────────────────────────────────────────────────────

describe("accountScopeFilter", () => {
  it("returns null for Administrator (unrestricted)", async () => {
    const filter = await accountScopeFilter(ADMIN);
    expect(filter).toBeNull();
  });

  it("returns OR filter with allowed accounts + own-leads clause", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([
      { accountId: "acc-1" },
    ] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(SALES);
    // Own-leads clause is now `{ ownerId }` (attached or not) so conversion,
    // which auto-attaches a lead to a fresh out-of-scope account, can't hide it.
    expect(filter).toEqual({
      OR: [
        { accountId: { in: ["acc-1"] } },
        { ownerId: "u-sales" },
      ],
    });
  });

  it("with empty allowed list → filter still includes own-leads clause", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(SALES);
    // With no accounts in scope, only the user's own leads are accessible.
    expect(filter).toEqual({
      OR: [
        { accountId: { in: [] } },
        { ownerId: "u-sales" },
      ],
    });
  });

  it("own-leads clause uses the caller's userId, not a hardcoded value", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(MANAGER);
    expect(filter).toMatchObject({
      OR: expect.arrayContaining([{ ownerId: "u-manager" }]),
    });
  });
});

// ─── assertAccountAccess ─────────────────────────────────────────────────────

describe("assertAccountAccess", () => {
  it("passes silently for Administrator on any account", async () => {
    await expect(assertAccountAccess(ADMIN, "any-account")).resolves.toBeUndefined();
  });

  it("passes when accountId is null or undefined", async () => {
    // Even a restricted user can skip assertion for unlinked records
    await expect(assertAccountAccess(SALES, null)).resolves.toBeUndefined();
    await expect(assertAccountAccess(SALES, undefined)).resolves.toBeUndefined();
  });

  it("passes when account is in scope", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([
      { accountId: "acc-allowed" },
    ] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    await expect(assertAccountAccess(SALES, "acc-allowed")).resolves.toBeUndefined();
  });

  it("throws 403 when account is not in scope", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const err = await assertAccountAccess(SALES, "forbidden-account").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { statusCode?: number }).statusCode).toBe(403);
  });

  // ── Own-record bypass: the detail-guard ↔ list-filter consistency fix ───────
  //
  // accountScopeFilter (LIST) has always had an `{ ownerId: self }` clause, so a
  // user's own record shows in the list even when its account is out of scope
  // (e.g. a lead auto-attached to a fresh account during conversion). The
  // per-record assertAccountAccess (DETAIL) lacked the matching bypass, so
  // opening that same record threw "account <id> not in scope". These tests
  // pin the two surfaces together.

  it("own-record bypass: owner reaches their own record on an out-of-scope account", async () => {
    // Empty ACL → the account is NOT in scope...
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    // ...but the caller owns the record, so access is granted without throwing.
    await expect(
      assertAccountAccess(SALES, "acc-out-of-scope", { recordOwnerId: SALES.userId }),
    ).resolves.toBeUndefined();
  });

  it("own-record bypass does NOT run any scope query (short-circuits on ownership)", async () => {
    await expect(
      assertAccountAccess(SALES, "acc-out-of-scope", { recordOwnerId: SALES.userId }),
    ).resolves.toBeUndefined();
    // Ownership match returns before getScope is consulted.
    expect(prismaMock.crmUserAccountAccess.findMany).not.toHaveBeenCalled();
  });

  it("own-record bypass does NOT leak another user's record on an out-of-scope account", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    // Record owned by someone else → owner bypass does not apply → 403.
    const err = await assertAccountAccess(SALES, "acc-out-of-scope", {
      recordOwnerId: "u-other",
    }).catch((e) => e);
    expect((err as { statusCode?: number }).statusCode).toBe(403);
  });

  it("bare-account check (no recordOwnerId) stays strict — write/attach paths unaffected", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    // No owner context (e.g. attaching a record to an arbitrary account) → 403.
    const err = await assertAccountAccess(SALES, "acc-out-of-scope").catch((e) => e);
    expect((err as { statusCode?: number }).statusCode).toBe(403);
  });

  it("throws 403 when user has no ACL at all (old fallback is gone)", async () => {
    // Pre-fix: with empty ACL, getScope returned unrestricted:true → no throw.
    // Post-fix: getScope returns restricted with empty list → throws 403.
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const err = await assertAccountAccess(MANAGER, "some-account").catch((e) => e);
    expect((err as { statusCode?: number }).statusCode).toBe(403);
  });
});

// ─── Regression: Lead visibility scenarios ───────────────────────────────────

describe("Lead visibility regression — accountId=null leads", () => {
  /**
   * Helper: simulate whether a given filter would match a null-accountId lead
   * owned by `leadOwnerId`.
   *
   * The Prisma OR filter produced by accountScopeFilter is:
   *   { OR: [{ accountId: { in: [...] } }, { ownerId: viewerId }, (team?) { ownerId: { in: [...] } }] }
   *
   * A lead matches if any branch matches given the lead's fields. For a
   * null-accountId lead the `accountId: { in }` branch never matches; the
   * own-leads branch (`{ ownerId }`) matches when the viewer owns it.
   */
  function filterMatchesNullLead(
    filter: Record<string, unknown> | null,
    leadOwnerId: string,
  ): boolean {
    if (filter === null) return true; // unrestricted (Admin)

    const orClauses = filter.OR as Array<{
      accountId?: { in?: string[] } | null;
      ownerId?: string | { in?: string[] };
    }>;

    return orClauses.some((clause) => {
      // The own-leads branch is exactly `{ ownerId: <viewerId> }` (no accountId key).
      if (clause.accountId === undefined && typeof clause.ownerId === "string") {
        return clause.ownerId === leadOwnerId;
      }
      // accountId: { in: [...] } branch never matches a null-accountId lead.
      return false;
    });
  }

  // ── Lead A: owner=Admin, accountId=null ──────────────────────────────────

  it("Lead A (owner=Admin, accountId=null): Admin can see it", async () => {
    const filter = await accountScopeFilter(ADMIN);
    expect(filterMatchesNullLead(filter, ADMIN.userId)).toBe(true);
  });

  it("Lead A (owner=Admin, accountId=null): SalesManager cannot see it", async () => {
    // Manager has no group membership and no direct ACL
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(MANAGER);
    expect(filterMatchesNullLead(filter, ADMIN.userId)).toBe(false);
  });

  it("Lead A (owner=Admin, accountId=null): SalesUser cannot see it", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(SALES);
    expect(filterMatchesNullLead(filter, ADMIN.userId)).toBe(false);
  });

  // ── Lead B: owner=SalesManager, accountId=null ───────────────────────────

  it("Lead B (owner=Manager, accountId=null): Admin can see it", async () => {
    const filter = await accountScopeFilter(ADMIN);
    expect(filterMatchesNullLead(filter, MANAGER.userId)).toBe(true);
  });

  it("Lead B (owner=Manager, accountId=null): SalesManager can see own lead", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(MANAGER);
    expect(filterMatchesNullLead(filter, MANAGER.userId)).toBe(true);
  });

  it("Lead B (owner=Manager, accountId=null): SalesUser cannot see it", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(SALES);
    expect(filterMatchesNullLead(filter, MANAGER.userId)).toBe(false);
  });

  // ── Lead C: owner=SalesUser, accountId=null ──────────────────────────────

  it("Lead C (owner=SalesUser, accountId=null): Admin can see it", async () => {
    const filter = await accountScopeFilter(ADMIN);
    expect(filterMatchesNullLead(filter, SALES.userId)).toBe(true);
  });

  it("Lead C (owner=SalesUser, accountId=null): SalesManager cannot see it", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(MANAGER);
    expect(filterMatchesNullLead(filter, SALES.userId)).toBe(false);
  });

  it("Lead C (owner=SalesUser, accountId=null): SalesUser can see own lead", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(SALES);
    expect(filterMatchesNullLead(filter, SALES.userId)).toBe(true);
  });

  // ── Cross-user isolation: SalesUser cannot see another SalesUser's null lead ─

  it("SalesUser cannot see a null-accountId lead owned by a different SalesUser", async () => {
    const otherSales: SessionUser = { ...SALES, userId: "u-other-sales" };

    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(SALES); // logged-in as u-sales
    // lead owned by u-other-sales
    expect(filterMatchesNullLead(filter, otherSales.userId)).toBe(false);
  });

  // ── Account-attached leads remain visible via the allowedAccountIds branch ──

  it("account-attached lead is visible to user whose scope includes that account", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([
      { accountId: "acc-visible" },
    ] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = (await accountScopeFilter(SALES)) as {
      OR: Array<{ accountId?: { in?: string[] } | null; ownerId?: string }>;
    };
    const accountClause = filter.OR.find(
      (c) => (c.accountId as { in?: string[] } | null)?.["in"] !== undefined,
    );
    expect((accountClause?.accountId as { in?: string[] })?.["in"]).toContain("acc-visible");
  });
});

// ─── Regression: own converted lead attached to an out-of-scope account ───────
describe("Regression — converted lead auto-attached to an out-of-scope account", () => {
  /**
   * Whether the filter matches a lead with the given (accountId, ownerId) for
   * a viewer. Mirrors the Prisma OR semantics of accountScopeFilter.
   */
  function filterMatchesLead(
    filter: Record<string, unknown> | null,
    lead: { accountId: string | null; ownerId: string },
    viewerId: string,
  ): boolean {
    if (filter === null) return true; // Admin (unrestricted)
    const orClauses = filter.OR as Array<{
      accountId?: { in?: string[] } | null;
      ownerId?: string | { in?: string[] };
    }>;
    return orClauses.some((c) => {
      // account-in branch
      if (c.accountId && typeof c.accountId === "object" && Array.isArray(c.accountId.in)) {
        return lead.accountId != null && c.accountId.in.includes(lead.accountId);
      }
      // own-leads branch: { ownerId: viewerId }
      if (c.accountId === undefined && typeof c.ownerId === "string") {
        return lead.ownerId === c.ownerId && c.ownerId === viewerId;
      }
      return false;
    });
  }

  it("owner sees their own converted lead even though its account is NOT in scope", async () => {
    // SalesUser owns a lead. On conversion it was auto-attached to a brand-new
    // account the user has no CrmUserAccountAccess to → empty allowed list.
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(SALES);
    const convertedOwnLead = { accountId: "acc-auto-created", ownerId: SALES.userId };
    expect(filterMatchesLead(filter, convertedOwnLead, SALES.userId)).toBe(true);
  });

  it("still does NOT leak another user's converted lead on an out-of-scope account", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(SALES);
    const othersConvertedLead = { accountId: "acc-auto-created", ownerId: "u-someone-else" };
    expect(filterMatchesLead(filter, othersConvertedLead, SALES.userId)).toBe(false);
  });
});
