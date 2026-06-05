import { describe, expect, it } from "vitest";
import {
  allCrmPermissionPairs,
  appRoleNameForMembershipRole,
  isValidCrmPermissionPair,
  MEMBERSHIP_ROLE_TO_APP_ROLE,
} from "@/lib/api/permissions-registry";

describe("permissions-registry", () => {
  it("maps org membership roles to app role slugs", () => {
    expect(appRoleNameForMembershipRole("Administrator")).toBe("admin");
    expect(appRoleNameForMembershipRole("SalesUser")).toBe("sales-user");
    expect(MEMBERSHIP_ROLE_TO_APP_ROLE.SalesManager).toBe("sales-manager");
  });

  it("validates module/action pairs", () => {
    expect(isValidCrmPermissionPair("leads", "view")).toBe(true);
    expect(isValidCrmPermissionPair("leads", "bogus")).toBe(false);
    expect(isValidCrmPermissionPair("unknown", "view")).toBe(false);
  });

  it("enumerates all CRM module actions", () => {
    const pairs = allCrmPermissionPairs();
    expect(pairs.some((p) => p.resource === "quotes" && p.action === "export")).toBe(true);
    expect(pairs.length).toBeGreaterThan(100);
  });
});
