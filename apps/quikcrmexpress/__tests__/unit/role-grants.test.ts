import { describe, it, expect } from "vitest";
import {
  isAdminRole,
  roleBaselineMatrix,
  ADMIN_ROLE,
  SALES_USER_ROLE,
  FINANCE_USER_ROLE,
} from "@/lib/auth/role-grants";
import { CRM_MODULES, CRM_ACTIONS } from "@/lib/api/permissions-registry";

/**
 * Guards the security-critical role baseline that makes the default-deny gate
 * in `assertModule` safe: every known role must resolve to a non-empty,
 * appropriately-scoped matrix, and only Administrators are unrestricted.
 */

function actionsFor(role: string, module: string): string[] {
  return roleBaselineMatrix(role).find((r) => r.module === module)?.actions ?? [];
}

describe("isAdminRole()", () => {
  it("is true only for the Administrator role (case-insensitive)", () => {
    expect(isAdminRole(ADMIN_ROLE)).toBe(true);
    expect(isAdminRole("administrator")).toBe(true);
    expect(isAdminRole(SALES_USER_ROLE)).toBe(false);
    expect(isAdminRole("SalesManager")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole("")).toBe(false);
  });
});

describe("roleBaselineMatrix()", () => {
  it("grants Administrator every action on every module", () => {
    const matrix = roleBaselineMatrix(ADMIN_ROLE);
    expect(matrix.length).toBe(CRM_MODULES.length);
    for (const module of CRM_MODULES) {
      expect(actionsFor(ADMIN_ROLE, module).sort()).toEqual([...CRM_ACTIONS].sort());
    }
  });

  it("gives SalesUser core modules but never settings/users or delete on leads", () => {
    expect(actionsFor(SALES_USER_ROLE, "leads")).toEqual(
      expect.arrayContaining(["view", "create", "edit"]),
    );
    expect(actionsFor(SALES_USER_ROLE, "leads")).not.toContain("delete");
    expect(actionsFor(SALES_USER_ROLE, "settings")).toEqual([]);
    expect(actionsFor(SALES_USER_ROLE, "users")).toEqual([]);
  });

  it("scopes FinanceUser to finance surfaces and excludes leads", () => {
    expect(actionsFor(FINANCE_USER_ROLE, "reports")).toEqual(
      expect.arrayContaining(["view", "export"]),
    );
    expect(actionsFor(FINANCE_USER_ROLE, "leads")).toEqual([]);
  });

  it("never produces an empty matrix for a non-admin (keeps default-deny safe)", () => {
    expect(roleBaselineMatrix(SALES_USER_ROLE).length).toBeGreaterThan(0);
    // An unrecognised role falls back to the restrictive SalesUser baseline,
    // not to an empty matrix (which would lock the user out everywhere) nor to
    // an admin matrix (which would over-grant).
    const unknown = roleBaselineMatrix("TotallyUnknownRole");
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown.find((r) => r.module === "settings")).toBeUndefined();
  });
});
