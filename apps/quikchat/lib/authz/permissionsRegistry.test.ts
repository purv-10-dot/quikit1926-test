import { describe, it, expect } from "vitest";
import { isModuleEnabled } from "@quikit/shared/moduleRegistry";
import {
  ACTIONS,
  PERMISSION_TREE,
  RESOURCES,
  RESOURCE_MODULE_KEY,
  allPermissionPairs,
  filterTreeByEnabledModules,
  isAction,
  isResource,
  isValidPermissionPair,
  walkLeaves,
} from "./permissionsRegistry";

describe("permissionsRegistry", () => {
  it("exposes the four action verbs", () => {
    expect([...ACTIONS]).toEqual(["view", "create", "update", "delete"]);
  });

  it("declares every RBAC_PLAN §4 resource", () => {
    const expected = [
      "Channel",
      "Channel.Public",
      "Channel.DM",
      "Channel.Moderate",
      "Call",
      "Call.Group",
      "Assistant",
      "Assistant.IngestPrivate",
      "Assistant.IngestOrg",
      "Assistant.Configure",
      "App.Modules",
    ];
    for (const r of expected) expect(isResource(r)).toBe(true);
    expect(RESOURCES.length).toBe(expected.length);
  });

  it("every tree leaf has at least one action and a label", () => {
    for (const leaf of walkLeaves()) {
      expect(leaf.actions.length).toBeGreaterThan(0);
      expect(leaf.label.length).toBeGreaterThan(0);
    }
  });

  it("allPermissionPairs enumerates exactly the leaf action pairs (16)", () => {
    const pairs = allPermissionPairs();
    // 4 (Channel) +1+1+2 +1+1 +2+1+1+1 +1 = 16
    // Was 17 until Channel.InviteExternal (+1) left the registry — it gated
    // nothing. A change here means the tree moved, not that a grant vanished.
    expect(pairs).toHaveLength(16);
    // No duplicates.
    const keys = new Set(pairs.map((p) => `${p.resource}:${p.action}`));
    expect(keys.size).toBe(pairs.length);
  });

  it("narrow leaves only permit their declared actions", () => {
    expect(isValidPermissionPair("Channel.Public", "create")).toBe(true);
    expect(isValidPermissionPair("Channel.Public", "delete")).toBe(false);
    expect(isValidPermissionPair("Channel.Moderate", "update")).toBe(true);
    expect(isValidPermissionPair("Channel.Moderate", "delete")).toBe(true);
    expect(isValidPermissionPair("Channel.Moderate", "view")).toBe(false);
    expect(isValidPermissionPair("App.Modules", "update")).toBe(true);
    expect(isValidPermissionPair("App.Modules", "create")).toBe(false);
  });

  it("Channel supports full CRUD-V", () => {
    for (const a of ["view", "create", "update", "delete"]) {
      expect(isValidPermissionPair("Channel", a)).toBe(true);
    }
  });

  it("rejects unknown resources and non-verb actions", () => {
    expect(isValidPermissionPair("Nope", "view")).toBe(false);
    expect(isValidPermissionPair("Channel", "frobnicate")).toBe(false);
    expect(isResource("Nope")).toBe(false);
    expect(isAction("frobnicate")).toBe(false);
    expect(isAction("view")).toBe(true);
  });

  it("has stable module keys", () => {
    expect(PERMISSION_TREE.map((m) => m.key)).toEqual([
      "Channel",
      "Call",
      "Assistant",
      "App",
    ]);
  });
});

describe("filterTreeByEnabledModules", () => {
  const keysOf = (tree: ReturnType<typeof filterTreeByEnabledModules>) =>
    tree.flatMap((m) => m.leaves.map((l) => l.resource));

  it("shows everything when nothing is disabled", () => {
    const tree = filterTreeByEnabledModules(PERMISSION_TREE, new Set(), isModuleEnabled);
    expect(keysOf(tree)).toEqual(RESOURCES);
  });

  it("drops calls leaves (and the empty Call module) when 'calls' is disabled", () => {
    const tree = filterTreeByEnabledModules(PERMISSION_TREE, new Set(["calls"]), isModuleEnabled);
    const keys = keysOf(tree);
    expect(keys).not.toContain("Call");
    expect(keys).not.toContain("Call.Group");
    expect(tree.find((m) => m.key === "Call")).toBeUndefined(); // module removed (0 leaves)
  });

  it("knowledge_base off hides only ingest leaves — assistant still works", () => {
    const tree = filterTreeByEnabledModules(
      PERMISSION_TREE,
      new Set(["knowledge_base"]),
      isModuleEnabled,
    );
    const assistant = tree.find((m) => m.key === "Assistant");
    expect(assistant).toBeTruthy();
    const keys = assistant!.leaves.map((l) => l.resource);
    expect(keys).toContain("Assistant");
    expect(keys).toContain("Assistant.Configure");
    expect(keys).not.toContain("Assistant.IngestPrivate");
    expect(keys).not.toContain("Assistant.IngestOrg");
  });

  it("Channel* + App.Modules are always shown (unmapped) even if messaging is disabled", () => {
    const tree = filterTreeByEnabledModules(
      PERMISSION_TREE,
      new Set(["messaging"]),
      isModuleEnabled,
    );
    const keys = keysOf(tree);
    expect(keys).toContain("Channel");
    expect(keys).toContain("Channel.Public");
    expect(keys).toContain("Channel.Moderate");
    expect(keys).toContain("App.Modules");
  });

  it("RESOURCE_MODULE_KEY maps only calls/assistant/kb leaves; Channel*/App.Modules unmapped", () => {
    expect(RESOURCE_MODULE_KEY["Call"]).toBe("calls");
    expect(RESOURCE_MODULE_KEY["Assistant.IngestOrg"]).toBe("knowledge_base");
    expect(RESOURCE_MODULE_KEY["Assistant"]).toBe("assistant");
    expect(RESOURCE_MODULE_KEY["Channel"]).toBeUndefined();
    expect(RESOURCE_MODULE_KEY["Channel.Public"]).toBeUndefined();
    expect(RESOURCE_MODULE_KEY["App.Modules"]).toBeUndefined();
  });
});
