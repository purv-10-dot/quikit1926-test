/**
 * lib/auth/prospect-acl — role → prospect visibility.
 *
 * Regression guard for the Settings → Prospects leak: the page used to query
 * `{ orgId }` flat, so every org member saw every saved prospect. The rule is
 * now: Administrators (which mapRole collapses Organization Admin / owner /
 * app_admin / super_admin into) see the org; everyone else sees only rows they
 * personally saved.
 *
 * Pure function, no DB — no mocks needed.
 */
import { describe, expect, it } from "vitest";
import { canViewAllProspects, prospectScopeWhere } from "@/lib/auth/prospect-acl";

const user = (role: string) => ({ role, userId: "u1", orgId: "org1" });

// Every non-admin CRM role mapRole can produce.
const NON_ADMIN_ROLES = [
  "TeamManager",
  "SalesManager",
  "SalesUser",
  "MarketingUser",
  "FinanceUser",
];

describe("canViewAllProspects", () => {
  it("is true for Administrator (covers Organization Admin — mapRole collapses both)", () => {
    expect(canViewAllProspects({ role: "Administrator" })).toBe(true);
  });

  it.each(NON_ADMIN_ROLES)("is false for %s", (role) => {
    expect(canViewAllProspects({ role })).toBe(false);
  });

  it("is false for an unrecognized role (deny by default)", () => {
    expect(canViewAllProspects({ role: "SomeFutureRole" })).toBe(false);
  });
});

describe("prospectScopeWhere", () => {
  it("scopes an Administrator to the org only — no owner narrowing", () => {
    expect(prospectScopeWhere(user("Administrator"))).toEqual({ orgId: "org1" });
  });

  it.each(NON_ADMIN_ROLES)("narrows %s to their own savedById", (role) => {
    expect(prospectScopeWhere(user(role))).toEqual({
      orgId: "org1",
      savedById: "u1",
    });
  });

  it("always carries orgId — no clause may drop org isolation", () => {
    for (const role of ["Administrator", ...NON_ADMIN_ROLES]) {
      expect(prospectScopeWhere(user(role)).orgId).toBe("org1");
    }
  });

  it("never widens a null owner to everyone (legacy rows stay admin-only)", () => {
    // savedById is an exact-match on the caller's id, so a legacy row with
    // savedById = null can never match a non-admin's clause.
    const where = prospectScopeWhere(user("SalesUser"));
    expect(where.savedById).toBe("u1");
    expect(where.savedById).not.toBeNull();
  });
});
