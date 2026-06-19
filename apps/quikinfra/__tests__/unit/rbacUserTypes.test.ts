import { describe, it, expect } from "vitest";
import {
  USER_TYPES,
  USER_TYPE_CATALOG,
  USER_TYPE_RANK,
  ASSIGNABLE_MODULES,
  getUserTypeDescriptor,
  getClientSelectableUserTypes,
  getDescriptorByRoleName,
  formatRoleLabel,
  getUserTypeRank,
} from "@/lib/rbac/user-types";
import { ROLE_KEYS } from "@/lib/rbac/roles";

describe("USER_TYPE_CATALOG", () => {
  it("has one descriptor per user type", () => {
    const keys = USER_TYPE_CATALOG.map((t) => t.key).sort();
    expect(keys).toEqual(Object.values(USER_TYPES).sort());
  });

  it("SUPER_ADMIN is the only non-client-selectable type", () => {
    const nonSelectable = USER_TYPE_CATALOG.filter((t) => !t.clientSelectable);
    expect(nonSelectable.map((t) => t.key)).toEqual([USER_TYPES.SUPER_ADMIN]);
  });

  it("ADMIN and SUPER_ADMIN are crossSite; SITE_ADMIN and USER are not", () => {
    expect(getUserTypeDescriptor(USER_TYPES.ADMIN)?.crossSite).toBe(true);
    expect(getUserTypeDescriptor(USER_TYPES.SUPER_ADMIN)?.crossSite).toBe(true);
    expect(getUserTypeDescriptor(USER_TYPES.HO_USER)?.crossSite).toBe(true);
    expect(getUserTypeDescriptor(USER_TYPES.SITE_ADMIN)?.crossSite).toBe(false);
    expect(getUserTypeDescriptor(USER_TYPES.USER)?.crossSite).toBe(false);
  });

  it("only SITE_ADMIN and USER require site assignment", () => {
    expect(getUserTypeDescriptor(USER_TYPES.SITE_ADMIN)?.requiresSiteAssignment).toBe(true);
    expect(getUserTypeDescriptor(USER_TYPES.USER)?.requiresSiteAssignment).toBe(true);
    expect(getUserTypeDescriptor(USER_TYPES.ADMIN)?.requiresSiteAssignment).toBe(false);
    expect(getUserTypeDescriptor(USER_TYPES.HO_USER)?.requiresSiteAssignment).toBe(false);
  });
});

describe("getUserTypeDescriptor", () => {
  it("returns the matching descriptor", () => {
    expect(getUserTypeDescriptor("ADMIN")?.backingRole).toBe(ROLE_KEYS.ADMIN);
  });
  it("returns undefined for an unknown type", () => {
    expect(getUserTypeDescriptor("NOPE")).toBeUndefined();
  });
});

describe("getClientSelectableUserTypes", () => {
  it("excludes SUPER_ADMIN", () => {
    const keys = getClientSelectableUserTypes().map((t) => t.key);
    expect(keys).not.toContain(USER_TYPES.SUPER_ADMIN);
    expect(keys).toContain(USER_TYPES.ADMIN);
    expect(keys.length).toBe(USER_TYPE_CATALOG.length - 1);
  });
});

describe("getDescriptorByRoleName", () => {
  it("maps a known system role name (case-insensitive) to its catalog entry", () => {
    expect(getDescriptorByRoleName("admin").key).toBe(USER_TYPES.ADMIN);
    expect(getDescriptorByRoleName("HO_USER").key).toBe(USER_TYPES.HO_USER);
    expect(getDescriptorByRoleName("Site_Admin").key).toBe(USER_TYPES.SITE_ADMIN);
  });

  it("falls back to a conservative custom-role descriptor for unknown names", () => {
    const d = getDescriptorByRoleName("purchase_manager");
    expect(d.key).toBe(USER_TYPES.USER);
    expect(d.label).toBe("purchase_manager");
    expect(d.backingRole).toBe(ROLE_KEYS.USER);
    expect(d.crossSite).toBe(false);
    expect(d.requiresModuleAssignment).toBe(true);
    expect(d.requiresSiteAssignment).toBe(true);
    expect(d.clientSelectable).toBe(true);
  });

  it("handles null / undefined by returning the custom fallback labelled 'Role'", () => {
    expect(getDescriptorByRoleName(null).label).toBe("Role");
    expect(getDescriptorByRoleName(undefined).label).toBe("Role");
    expect(getDescriptorByRoleName(null).key).toBe(USER_TYPES.USER);
  });
});

describe("formatRoleLabel", () => {
  it("returns the catalog label for known system roles", () => {
    expect(formatRoleLabel("admin")).toBe("Admin (All Modules)");
    expect(formatRoleLabel("ho_user")).toBe("HO User (Cross-site, page-level)");
  });

  it("title-cases custom snake_case names, upper-casing short tokens", () => {
    expect(formatRoleLabel("purchase_manager")).toBe("Purchase Manager");
    expect(formatRoleLabel("qa_lead")).toBe("QA Lead");
  });

  it("returns empty string for null / undefined", () => {
    expect(formatRoleLabel(null)).toBe("");
    expect(formatRoleLabel(undefined)).toBe("");
  });
});

describe("USER_TYPE_RANK / getUserTypeRank", () => {
  it("ranks ascend USER < SITE_ADMIN < HO_USER < ADMIN < SUPER_ADMIN", () => {
    expect(USER_TYPE_RANK.USER).toBeLessThan(USER_TYPE_RANK.SITE_ADMIN);
    expect(USER_TYPE_RANK.SITE_ADMIN).toBeLessThan(USER_TYPE_RANK.HO_USER);
    expect(USER_TYPE_RANK.HO_USER).toBeLessThan(USER_TYPE_RANK.ADMIN);
    expect(USER_TYPE_RANK.ADMIN).toBeLessThan(USER_TYPE_RANK.SUPER_ADMIN);
  });

  it("getUserTypeRank looks up the numeric rank", () => {
    expect(getUserTypeRank("ADMIN")).toBe(4);
    expect(getUserTypeRank("SUPER_ADMIN")).toBe(5);
  });

  it("getUserTypeRank returns 0 for null / undefined / unknown", () => {
    expect(getUserTypeRank(null)).toBe(0);
    expect(getUserTypeRank(undefined)).toBe(0);
    expect(getUserTypeRank("WHO_AM_I")).toBe(0);
  });
});

describe("ASSIGNABLE_MODULES", () => {
  it("lists the sidebar parent groups", () => {
    const keys = ASSIGNABLE_MODULES.map((m) => m.key);
    expect(keys).toContain("purchase");
    expect(keys).toContain("project_mgmt");
    expect(keys).toContain("finance");
  });
});
