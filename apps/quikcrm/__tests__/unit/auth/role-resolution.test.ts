/**
 * Stage 2a — shared CRM role resolver (RED→GREEN, CHARACTERIZATION).
 *
 * Extracts mapRole (currently private in lib/auth/require.ts) + the readSession
 * effectiveRole rule into ONE shared module, so the Settings→Users eligibility
 * path resolves a row's role the SAME way readSession resolves session.role.
 * UI-eligible ⟺ send-time-eligible by construction (one function, two callers).
 *
 * BEHAVIOR-PRESERVING: these cases pin mapRole's EXACT current behavior (every
 * branch in require.ts:28-60) so the extraction can't silently change it —
 * require.ts must keep producing identical session.role after re-importing.
 *
 * resolveCrmRole({ membershipRole, appAccessRole }) mirrors readSession:
 *   effectiveRole = (appAccessRole && appAccessRole !== "member") ? appAccessRole
 *                                                                 : membershipRole
 *   role = mapRole(effectiveRole)
 *
 * Module does not exist yet → RED.
 */
import { describe, it, expect } from "vitest";
import { mapRole, resolveCrmRole } from "@/lib/auth/role-resolution";

describe("mapRole — characterization (exact current behavior from require.ts)", () => {
  it("admin-shaped → Administrator", () => {
    for (const r of ["admin", "owner", "super_admin", "administrator", "org_admin", "app_admin"]) {
      expect(mapRole(r)).toBe("Administrator");
    }
  });

  it("team-manager-shaped → TeamManager", () => {
    for (const r of ["team_manager", "team-manager", "teammanager", "team manager", "regional_director"]) {
      expect(mapRole(r)).toBe("TeamManager");
    }
  });

  it("manager / sales-manager variants → SalesManager", () => {
    for (const r of ["manager", "sales_manager", "salesmanager", "sales-manager"]) {
      expect(mapRole(r)).toBe("SalesManager");
    }
  });

  it("marketing variants → MarketingUser", () => {
    for (const r of ["marketing", "marketing_user", "marketinguser", "marketing-user"]) {
      expect(mapRole(r)).toBe("MarketingUser");
    }
  });

  it("finance variants → FinanceUser", () => {
    for (const r of ["finance", "finance_user", "financeuser", "finance-user"]) {
      expect(mapRole(r)).toBe("FinanceUser");
    }
  });

  it("member / user / unknown / undefined → SalesUser (broad default)", () => {
    for (const r of ["member", "user", "sales-user", "whatever", undefined]) {
      expect(mapRole(r)).toBe("SalesUser");
    }
  });

  it("is case-insensitive", () => {
    expect(mapRole("ADMIN")).toBe("Administrator");
    expect(mapRole("Sales-Manager")).toBe("SalesManager");
  });
});

describe("resolveCrmRole — effectiveRole rule (mirrors readSession)", () => {
  it("appAccessRole (non-member) OVERRIDES membershipRole", () => {
    // Sanyukta: OrgMember=member, UserAppAccess=sales-manager → SalesManager
    expect(resolveCrmRole({ membershipRole: "member", appAccessRole: "sales-manager" })).toBe("SalesManager");
    // Akhilesh: OrgMember=member, UserAppAccess=admin → Administrator
    expect(resolveCrmRole({ membershipRole: "member", appAccessRole: "admin" })).toBe("Administrator");
  });

  it("appAccessRole === 'member' does NOT override (falls back to membership)", () => {
    // a stray quikscale-style 'member' app row must not downgrade an org_admin
    expect(resolveCrmRole({ membershipRole: "org_admin", appAccessRole: "member" })).toBe("Administrator");
  });

  it("no appAccessRole → uses membershipRole", () => {
    // Ashwin: OrgMember=org_admin, no quikcrm UserAppAccess → Administrator
    expect(resolveCrmRole({ membershipRole: "org_admin", appAccessRole: null })).toBe("Administrator");
    expect(resolveCrmRole({ membershipRole: "member", appAccessRole: undefined })).toBe("SalesUser");
  });
});
