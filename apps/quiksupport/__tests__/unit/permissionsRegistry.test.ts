import { describe, it, expect } from "vitest";
import {
  RESOURCES,
  ACTIONS,
  NAV_KEYS,
  isResource,
  isAction,
  isValidPermissionPair,
  isNavKey,
  allPermissionPairs,
} from "@/lib/api/permissionsRegistry";

/**
 * Pure-function coverage for the Qsp* permission registry — the single source
 * of truth that both the role seeder and the userCan/loadMyPermissions gate
 * derive from. No DB, no mocks.
 */
describe("permissionsRegistry", () => {
  it("derives resources + actions from the helpdesk catalogue", () => {
    expect(RESOURCES).toEqual(expect.arrayContaining(["ticket", "user", "role"]));
    expect(ACTIONS).toEqual(
      expect.arrayContaining(["create", "assign", "update", "close", "escalate", "manage"]),
    );
  });

  it("recognises valid resources / actions and rejects unknown ones", () => {
    expect(isResource("ticket")).toBe(true);
    expect(isResource("nope")).toBe(false);
    expect(isAction("create")).toBe(true);
    expect(isAction("nope")).toBe(false);
  });

  it("validates only (resource, action) pairs that exist in the catalogue", () => {
    expect(isValidPermissionPair("ticket", "create")).toBe(true);
    expect(isValidPermissionPair("role", "manage")).toBe(true);
    // resource + action both valid, but not a real pair
    expect(isValidPermissionPair("role", "escalate")).toBe(false);
    expect(isValidPermissionPair("ticket", "manage")).toBe(false);
  });

  it("exposes the sidebar nav keys the app ships", () => {
    expect(NAV_KEYS).toContain("dashboard");
    expect(NAV_KEYS).toContain("tickets");
    expect(isNavKey("reports")).toBe(true);
    expect(isNavKey("not-a-nav")).toBe(false);
  });

  it("allPermissionPairs matches the catalogue length and has no dupes", () => {
    const pairs = allPermissionPairs();
    expect(pairs.length).toBe(7);
    const keys = new Set(pairs.map((p) => `${p.resource}:${p.action}`));
    expect(keys.size).toBe(pairs.length);
  });
});
