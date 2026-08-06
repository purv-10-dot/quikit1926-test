import { describe, it, expect } from "vitest";
import {
  ACTIONS,
  ALL_MODULE_KEYS,
  MODULE_TO_RESOURCES,
  modulePermissionPairs,
  pairsToRevokeForModules,
  modulesFromPermissions,
  allPermissionPairs,
  isValidPermissionPair,
  isAction,
  parsePermissionKey,
  walkLeaves,
} from "@/lib/rbac/permissionsRegistry";

describe("isAction", () => {
  it("recognises known actions", () => {
    for (const a of ACTIONS) expect(isAction(a)).toBe(true);
  });
  it("rejects unknown actions", () => {
    expect(isAction("frobnicate")).toBe(false);
    expect(isAction("")).toBe(false);
  });
});

describe("parsePermissionKey", () => {
  it("splits resource + trailing action", () => {
    expect(parsePermissionKey("construction.boq.view")).toEqual({
      resource: "construction.boq",
      action: "view",
    });
    expect(parsePermissionKey("construction.dpr.reverse")).toEqual({
      resource: "construction.dpr",
      action: "reverse",
    });
  });

  it("returns null when the trailing segment is not a known action", () => {
    expect(parsePermissionKey("construction.boq.frobnicate")).toBeNull();
  });

  it("returns null for malformed keys (no dot / leading dot / trailing dot)", () => {
    expect(parsePermissionKey("view")).toBeNull();
    expect(parsePermissionKey(".view")).toBeNull();
    expect(parsePermissionKey("construction.boq.")).toBeNull();
    expect(parsePermissionKey("")).toBeNull();
  });
});

describe("allPermissionPairs / walkLeaves", () => {
  it("flattens every leaf action across modules + submodules", () => {
    const pairs = allPermissionPairs();
    expect(pairs.length).toBeGreaterThan(0);
    // construction.boq has a "lock" action under the Projects > BOQ submodule.
    expect(pairs).toContainEqual({ resource: "construction.boq", action: "lock" });
    // construction.transfer has a "receive" action under Store > Transfer.
    expect(pairs).toContainEqual({ resource: "construction.transfer", action: "receive" });
    // construction.settings is manage-only.
    expect(pairs).toContainEqual({ resource: "construction.settings", action: "manage" });
  });

  it("is cached — returns a stable reference", () => {
    expect(allPermissionPairs()).toBe(allPermissionPairs());
  });

  it("walkLeaves yields the same leaf count as the pair grouping", () => {
    const leaves = [...walkLeaves()];
    const totalActions = leaves.reduce((n, l) => n + l.actions.length, 0);
    expect(allPermissionPairs().length).toBe(totalActions);
  });
});

describe("isValidPermissionPair", () => {
  it("accepts a real (resource, action) pair", () => {
    expect(isValidPermissionPair("construction.boq", "view")).toBe(true);
    expect(isValidPermissionPair("construction.transfer", "receive")).toBe(true);
  });
  it("rejects an action the resource does not expose", () => {
    // construction.stock only exposes "view".
    expect(isValidPermissionPair("construction.stock", "delete")).toBe(false);
  });
  it("rejects an unknown resource", () => {
    expect(isValidPermissionPair("construction.nope", "view")).toBe(false);
  });
});

describe("MODULE_TO_RESOURCES / ALL_MODULE_KEYS", () => {
  it("exposes the expected module keys", () => {
    expect(ALL_MODULE_KEYS).toEqual(Object.keys(MODULE_TO_RESOURCES));
    expect(ALL_MODULE_KEYS).toContain("purchase");
    expect(ALL_MODULE_KEYS).toContain("project_mgmt");
  });
});

describe("modulePermissionPairs", () => {
  it("returns every pair for a populated module", () => {
    const pairs = modulePermissionPairs("purchase");
    expect(pairs.length).toBeGreaterThan(0);
    // every returned pair's resource must belong to the purchase module
    const allowed = new Set(MODULE_TO_RESOURCES["purchase"]);
    for (const p of pairs) expect(allowed.has(p.resource)).toBe(true);
  });

  it("returns [] for a module with no resources (organization, quality_safety map to a resource not in the tree)", () => {
    // organization maps to construction.organization which IS in the tree,
    // so use an unknown module key for the truly-empty case.
    expect(modulePermissionPairs("does-not-exist")).toEqual([]);
  });
});

describe("pairsToRevokeForModules", () => {
  it("revokes everything in UNticked modules and nothing in ticked ones", () => {
    const ticked = ["purchase"];
    const revoke = pairsToRevokeForModules(ticked);
    const purchaseResources = new Set(MODULE_TO_RESOURCES["purchase"]);
    // No purchase pair should be in the revoke list.
    expect(revoke.some((p) => purchaseResources.has(p.resource))).toBe(false);
    // Some project_mgmt pair (unticked) should be present.
    const pmResources = new Set(MODULE_TO_RESOURCES["project_mgmt"]);
    expect(revoke.some((p) => pmResources.has(p.resource))).toBe(true);
  });

  it("ticking all modules revokes nothing", () => {
    expect(pairsToRevokeForModules([...ALL_MODULE_KEYS])).toEqual([]);
  });

  it("ticking nothing revokes the entire module universe", () => {
    const all = pairsToRevokeForModules([]);
    let expected = 0;
    for (const m of ALL_MODULE_KEYS) expected += modulePermissionPairs(m).length;
    expect(all.length).toBe(expected);
  });
});

describe("modulesFromPermissions", () => {
  it("derives the module a resource-prefixed permission belongs to", () => {
    const perms = new Set<string>(["construction.po.create"]);
    expect(modulesFromPermissions(perms)).toEqual(["purchase"]);
  });

  it("reports multiple modules when permissions span them", () => {
    const perms = new Set<string>([
      "construction.po.view",
      "construction.boq.view",
      "construction.master_vendor.edit",
    ]);
    const mods = modulesFromPermissions(perms);
    expect(mods).toContain("purchase");
    expect(mods).toContain("project_mgmt");
    expect(mods).toContain("masters");
  });

  it("ignores keys with no resource segment", () => {
    expect(modulesFromPermissions(new Set(["view", ".view", ""]))).toEqual([]);
  });

  it("ignores permissions for resources outside any module", () => {
    // construction.settings.manage isn't mapped to a module.
    expect(modulesFromPermissions(new Set(["construction.settings.manage"]))).toEqual([]);
  });

  it("returns [] for an empty permission set", () => {
    expect(modulesFromPermissions(new Set())).toEqual([]);
  });
});
