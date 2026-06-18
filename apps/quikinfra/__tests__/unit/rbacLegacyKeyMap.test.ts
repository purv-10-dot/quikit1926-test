import { describe, it, expect } from "vitest";
import { LEGACY_KEY_MAP, lookupLegacyKey } from "@/lib/rbac/legacyKeyMap";

// NOTE: importing this module runs assertLegacyMapIsValid() at load time —
// if any mapping pointed at a non-existent permission pair, the import would
// throw and every test here would error. A clean import is itself a check.

describe("LEGACY_KEY_MAP", () => {
  it("maps boq.read to construction.boq/view", () => {
    expect(LEGACY_KEY_MAP["boq.read"]).toEqual({ resource: "construction.boq", action: "view" });
  });
  it("maps boq.write to the edit action (ambiguous → edit decision)", () => {
    expect(LEGACY_KEY_MAP["boq.write"].action).toBe("edit");
  });
  it("shares the lock authority between boq.lock and boq.unlock", () => {
    expect(LEGACY_KEY_MAP["boq.lock"]).toEqual(LEGACY_KEY_MAP["boq.unlock"]);
  });
  it("maps rab.approve to the approve action", () => {
    expect(LEGACY_KEY_MAP["rab.approve"]).toEqual({ resource: "construction.rab", action: "approve" });
  });
  it("every mapping has a non-empty resource + action", () => {
    for (const [, m] of Object.entries(LEGACY_KEY_MAP)) {
      expect(m.resource).toBeTruthy();
      expect(m.action).toBeTruthy();
    }
  });
});

describe("lookupLegacyKey", () => {
  it("returns the mapping for a known key", () => {
    expect(lookupLegacyKey("finance.view")).toEqual({ resource: "construction.finance", action: "view" });
  });
  it("returns null for an unknown key", () => {
    expect(lookupLegacyKey("does.not.exist")).toBeNull();
  });
});
