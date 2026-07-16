import { describe, it, expect } from "vitest";
import {
  ACTIONS,
  PERMISSION_TREE,
  RESOURCES,
  allPermissionPairs,
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
      "Channel.InviteExternal",
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

  it("allPermissionPairs enumerates exactly the leaf action pairs (17)", () => {
    const pairs = allPermissionPairs();
    // 4 (Channel) +1+1+2+1 +1+1 +2+1+1+1 +1 = 17
    expect(pairs).toHaveLength(17);
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
