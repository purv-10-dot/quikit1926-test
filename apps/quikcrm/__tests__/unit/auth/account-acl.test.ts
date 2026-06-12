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
import { prismaMock } from "../../helpers/prisma-unit-mock";

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

beforeEach(() => vi.clearAllMocks());

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
    expect(scope).toEqual({ unrestricted: false, allowedAccountIds: ["acc-1"] });
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
    expect(scope).toEqual({ unrestricted: false, allowedAccountIds: ["acc-grp"] });
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
    expect(scope).toEqual({ unrestricted: false, allowedAccountIds: [] });
  });

  it("SalesManager with no groups → restricted with empty list (not unrestricted)", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const scope = await getScope(MANAGER);
    expect(scope).toEqual({ unrestricted: false, allowedAccountIds: [] });
  });
});

// ─── accountScopeFilter ──────────────────────────────────────────────────────

describe("accountScopeFilter", () => {
  it("returns null for Administrator (unrestricted)", async () => {
    const filter = await accountScopeFilter(ADMIN);
    expect(filter).toBeNull();
  });

  it("returns OR filter with allowed accounts + owner-only null clause", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([
      { accountId: "acc-1" },
    ] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(SALES);
    expect(filter).toEqual({
      OR: [
        { accountId: { in: ["acc-1"] } },
        { accountId: null, ownerId: "u-sales" },
      ],
    });
  });

  it("with empty allowed list → filter still includes owner-only null clause", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(SALES);
    // With no accounts in scope, only own-null-leads are accessible
    expect(filter).toEqual({
      OR: [
        { accountId: { in: [] } },
        { accountId: null, ownerId: "u-sales" },
      ],
    });
  });

  it("null-accountId clause uses the caller's userId, not a hardcoded value", async () => {
    prismaMock.crmUserAccountAccess.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);
    prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);

    const filter = await accountScopeFilter(MANAGER);
    expect(filter).toMatchObject({
      OR: expect.arrayContaining([{ accountId: null, ownerId: "u-manager" }]),
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
   *   { OR: [{ accountId: { in: [...] } }, { accountId: null, ownerId: viewerId }] }
   *
   * A lead matches if either branch matches given the lead's fields.
   */
  function filterMatchesNullLead(
    filter: Record<string, unknown> | null,
    leadOwnerId: string,
  ): boolean {
    if (filter === null) return true; // unrestricted (Admin)

    const orClauses = filter.OR as Array<{
      accountId?: { in?: string[] } | null;
      ownerId?: string;
    }>;

    return orClauses.some((clause) => {
      if (clause.accountId === null) {
        // null-accountId branch: matches only if ownerId matches
        return clause.ownerId === leadOwnerId;
      }
      // accountId: { in: [...] } branch never matches a null-accountId lead
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
