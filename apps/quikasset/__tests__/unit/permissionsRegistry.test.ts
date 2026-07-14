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
