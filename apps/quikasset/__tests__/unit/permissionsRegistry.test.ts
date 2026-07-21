import { describe, it, expect } from "vitest";
import {
  ACTIONS,
  allPermissionPairs,
  isValidPermissionPair,
} from "@/lib/api/permissionsRegistry";

describe("permissionsRegistry — Asset:viewAll capability", () => {
  it("registers viewAll as an action", () => {
    expect(ACTIONS).toContain("viewAll");
  });

  it("accepts viewAll only on Asset", () => {
    expect(isValidPermissionPair("Asset", "viewAll")).toBe(true);
    expect(isValidPermissionPair("Category", "viewAll")).toBe(false);
    expect(isValidPermissionPair("Assignment", "viewAll")).toBe(false);
    expect(isValidPermissionPair("Employee", "viewAll")).toBe(false);
    // view-only resources never expose viewAll either
    expect(isValidPermissionPair("Report", "viewAll")).toBe(false);
  });

  it("keeps standard CRUD pairs valid", () => {
    expect(isValidPermissionPair("Asset", "view")).toBe(true);
    expect(isValidPermissionPair("Asset", "delete")).toBe(true);
    expect(isValidPermissionPair("Notification", "view")).toBe(true);
    expect(isValidPermissionPair("Notification", "create")).toBe(false); // view-only
  });

  it("emits Asset:viewAll in the full grant set but not for other resources", () => {
    const pairs = allPermissionPairs().map((p) => `${p.resource}:${p.action}`);
    expect(pairs).toContain("Asset:viewAll");
    expect(pairs).toContain("Asset:view");
    expect(pairs).not.toContain("Category:viewAll");
    expect(pairs).not.toContain("Assignment:viewAll");
    expect(pairs).not.toContain("Employee:viewAll");
  });
});

describe("permissionsRegistry — AssetRequest:approve capability", () => {
  it("registers approve as an action", () => {
    expect(ACTIONS).toContain("approve");
  });

  it("accepts approve only on AssetRequest", () => {
    expect(isValidPermissionPair("AssetRequest", "approve")).toBe(true);
    expect(isValidPermissionPair("Asset", "approve")).toBe(false);
    expect(isValidPermissionPair("Assignment", "approve")).toBe(false);
    // view-only resources never expose approve either
    expect(isValidPermissionPair("Report", "approve")).toBe(false);
  });

  it("gives AssetRequest the full capability set incl. viewAll + approve", () => {
    for (const action of ["view", "create", "update", "delete", "viewAll", "approve"]) {
      expect(isValidPermissionPair("AssetRequest", action)).toBe(true);
    }
  });

  it("emits AssetRequest:approve + viewAll in the full grant set, not for other resources", () => {
    const pairs = allPermissionPairs().map((p) => `${p.resource}:${p.action}`);
    expect(pairs).toContain("AssetRequest:approve");
    expect(pairs).toContain("AssetRequest:viewAll");
    expect(pairs).not.toContain("Asset:approve");
    expect(pairs).not.toContain("Assignment:approve");
  });
});

describe("permissionsRegistry — RepairRequest capability", () => {
  it("gives RepairRequest the full capability set incl. viewAll + approve", () => {
    for (const action of ["view", "create", "update", "delete", "viewAll", "approve"]) {
      expect(isValidPermissionPair("RepairRequest", action)).toBe(true);
    }
  });

  it("emits RepairRequest:approve + viewAll in the full grant set", () => {
    const pairs = allPermissionPairs().map((p) => `${p.resource}:${p.action}`);
    expect(pairs).toContain("RepairRequest:approve");
    expect(pairs).toContain("RepairRequest:viewAll");
    expect(pairs).toContain("RepairRequest:create");
    expect(pairs).toContain("RepairRequest:view");
  });

  // The plain admin-only Repair resource stays CRUD-only — it is NOT an
  // approvable/queue resource (that's what RepairRequest is for).
  it("does not turn the Repair resource into an approvable one", () => {
    expect(isValidPermissionPair("Repair", "approve")).toBe(false);
    expect(isValidPermissionPair("Repair", "viewAll")).toBe(false);
  });
});
