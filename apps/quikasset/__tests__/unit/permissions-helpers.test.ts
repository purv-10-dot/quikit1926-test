import { describe, it, expect } from "vitest";
import { allValidPairsGranted } from "../../app/(dashboard)/settings/user-management/_components/permissions-helpers";
import { allPermissionPairs } from "../../lib/api/permissionsRegistry";

const keyOf = (p: { resource: string; action: string }) => `${p.resource}:${p.action}`;

/**
 * Drives the "all permissions inherited from role" note: true only when the
 * role already grants every valid pair (e.g. Admin), so no extras can be added.
 */
describe("allValidPairsGranted", () => {
  it("is false when the role grants nothing (extras are addable)", () => {
    expect(allValidPairsGranted(new Set())).toBe(false);
  });

  it("is false when only some valid pairs are granted", () => {
    const some = new Set(allPermissionPairs().slice(0, 3).map(keyOf));
    expect(allValidPairsGranted(some)).toBe(false);
  });

  it("is true when the role grants every valid pair (e.g. Admin)", () => {
    const all = new Set(allPermissionPairs().map(keyOf));
    expect(allValidPairsGranted(all)).toBe(true);
  });

  it("ignores unrelated keys in the grant set", () => {
    const withNoise = new Set([...allPermissionPairs().map(keyOf), "Bogus:action"]);
    expect(allValidPairsGranted(withNoise)).toBe(true);
  });
});
