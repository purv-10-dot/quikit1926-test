import { describe, it, expect } from "vitest";
import { selectMissingGrants, ASSET_REQUEST_MEMBER_GRANTS } from "../../scripts/assetRequestGrantPlan";

/**
 * AssetRequest Member-grant backfill selector: given a Member role's existing
 * permission pairs, returns which of the two target grants
 * (AssetRequest:view / AssetRequest:create) are missing. A regression here would
 * either skip orgs that need the grants or re-add ones already present.
 */
describe("selectMissingGrants", () => {
  it("returns both grants for a role that has neither", () => {
    expect(selectMissingGrants([{ resource: "Asset", action: "view" }])).toEqual([
      { resource: "AssetRequest", action: "view" },
      { resource: "AssetRequest", action: "create" },
    ]);
  });

  it("returns only the missing grant when one is already present", () => {
    expect(
      selectMissingGrants([
        { resource: "Asset", action: "view" },
        { resource: "AssetRequest", action: "view" },
      ]),
    ).toEqual([{ resource: "AssetRequest", action: "create" }]);
  });

  it("returns nothing when both grants are already present (idempotent)", () => {
    expect(selectMissingGrants(ASSET_REQUEST_MEMBER_GRANTS)).toEqual([]);
  });

  it("handles an empty permission list", () => {
    expect(selectMissingGrants([])).toEqual([
      { resource: "AssetRequest", action: "view" },
      { resource: "AssetRequest", action: "create" },
    ]);
  });
});
