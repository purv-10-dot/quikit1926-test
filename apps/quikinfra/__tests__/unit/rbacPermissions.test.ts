import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  ALL_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  filterPermissionsByModules,
} from "@/lib/rbac/permissions";

describe("PERMISSIONS catalog constants", () => {
  it("uses the <module>.<...>.<action> naming convention", () => {
    expect(PERMISSIONS.BOQ_READ).toBe("boq.read");
    expect(PERMISSIONS.MR_READ).toBe("purchase.mr.read");
    expect(PERMISSIONS.INDENT_APPROVE_L1).toBe("purchase.indent.approve_l1");
    expect(PERMISSIONS.AUDIT_VIEW).toBe("audit.view");
  });

  it("has unique permission key values", () => {
    const values = Object.values(PERMISSIONS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("ALL_PERMISSION_KEYS", () => {
  it("equals Object.values(PERMISSIONS)", () => {
    expect(ALL_PERMISSION_KEYS).toEqual(Object.values(PERMISSIONS));
  });

  it("contains every catalog key", () => {
    const keySet = new Set(ALL_PERMISSION_KEYS);
    for (const d of PERMISSION_CATALOG) {
      expect(keySet.has(d.key)).toBe(true);
    }
  });
});

describe("PERMISSION_CATALOG", () => {
  it("covers every permission key exactly once", () => {
    const catalogKeys = PERMISSION_CATALOG.map((d) => d.key).sort();
    const allKeys = [...ALL_PERMISSION_KEYS].sort();
    expect(catalogKeys).toEqual(allKeys);
    expect(new Set(catalogKeys).size).toBe(catalogKeys.length);
  });

  it("every descriptor carries a name + module", () => {
    for (const d of PERMISSION_CATALOG) {
      expect(typeof d.name).toBe("string");
      expect(d.name.length).toBeGreaterThan(0);
      expect(typeof d.module).toBe("string");
      expect(d.module.length).toBeGreaterThan(0);
    }
  });
});

describe("filterPermissionsByModules", () => {
  it("returns the same set unchanged when it holds the wildcard", () => {
    const perms = new Set<string>(["*", "boq.write"]);
    const out = filterPermissionsByModules(perms, []);
    expect(out).toBe(perms); // identity — wildcard short-circuits
  });

  it("keeps writes/approvals only for assigned modules", () => {
    // purchase.po.write maps to "purchase"; boq.write maps to "project_mgmt".
    const perms = new Set<string>([
      PERMISSIONS.PO_WRITE,
      PERMISSIONS.BOQ_WRITE,
    ]);
    const out = filterPermissionsByModules(perms, ["purchase"]);
    expect(out.has(PERMISSIONS.PO_WRITE)).toBe(true);
    expect(out.has(PERMISSIONS.BOQ_WRITE)).toBe(false);
  });

  it("always keeps .read permissions regardless of module assignment", () => {
    const perms = new Set<string>([PERMISSIONS.BOQ_READ, PERMISSIONS.PO_READ]);
    const out = filterPermissionsByModules(perms, []); // nothing assigned
    expect(out.has(PERMISSIONS.BOQ_READ)).toBe(true);
    expect(out.has(PERMISSIONS.PO_READ)).toBe(true);
  });

  it("keeps cross-cutting permissions that have no module mapping", () => {
    // settings.* / audit.* / finance.* are not in PERMISSION_TO_ASSIGNABLE_MODULE.
    const perms = new Set<string>([
      PERMISSIONS.SETTINGS_USERS,
      PERMISSIONS.AUDIT_VIEW,
      PERMISSIONS.FINANCE_TDS_CONFIG,
    ]);
    const out = filterPermissionsByModules(perms, []);
    expect(out.has(PERMISSIONS.SETTINGS_USERS)).toBe(true);
    expect(out.has(PERMISSIONS.AUDIT_VIEW)).toBe(true);
    expect(out.has(PERMISSIONS.FINANCE_TDS_CONFIG)).toBe(true);
  });

  it("maps boq/dpr/rab/wo/wbs writes to project_mgmt", () => {
    const perms = new Set<string>([
      PERMISSIONS.DPR_WRITE,
      PERMISSIONS.RAB_WRITE,
      PERMISSIONS.WBS_WRITE,
    ]);
    const granted = filterPermissionsByModules(perms, ["project_mgmt"]);
    expect(granted.has(PERMISSIONS.DPR_WRITE)).toBe(true);
    expect(granted.has(PERMISSIONS.RAB_WRITE)).toBe(true);
    expect(granted.has(PERMISSIONS.WBS_WRITE)).toBe(true);

    const denied = filterPermissionsByModules(perms, ["masters"]);
    expect(denied.has(PERMISSIONS.DPR_WRITE)).toBe(false);
  });

  it("maps quality/safety writes to quality_safety", () => {
    const perms = new Set<string>([PERMISSIONS.QUALITY_WRITE, PERMISSIONS.SAFETY_WRITE]);
    const granted = filterPermissionsByModules(perms, ["quality_safety"]);
    expect(granted.has(PERMISSIONS.QUALITY_WRITE)).toBe(true);
    expect(granted.has(PERMISSIONS.SAFETY_WRITE)).toBe(true);
    const denied = filterPermissionsByModules(perms, []);
    expect(denied.has(PERMISSIONS.QUALITY_WRITE)).toBe(false);
  });

  it("returns an empty set when given an empty input set", () => {
    expect(filterPermissionsByModules(new Set(), ["purchase"]).size).toBe(0);
  });
});
