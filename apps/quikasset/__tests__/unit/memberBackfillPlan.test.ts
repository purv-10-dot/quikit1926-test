import { describe, it, expect } from "vitest";
import { selectNoRoleUsers } from "../../scripts/memberBackfillPlan";

/**
 * Phase-3 backfill selector: locks "who is a No-role user" = has QuikAsset
 * access but appears in no AstUserAppRole row. A regression here would either
 * miss users who can't see their assets or re-assign users who already have a
 * (possibly custom) role — the latter must never happen.
 */
describe("selectNoRoleUsers", () => {
  it("returns access users who hold no app role", () => {
    expect(selectNoRoleUsers(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });

  it("never touches users who already have a role (e.g. custom 'IT team')", () => {
    expect(selectNoRoleUsers(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("returns everyone when nobody is roled", () => {
    expect(selectNoRoleUsers(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("ignores roled ids that aren't in the access set", () => {
    expect(selectNoRoleUsers(["a"], ["x", "y"])).toEqual(["a"]);
  });

  it("preserves input order", () => {
    expect(selectNoRoleUsers(["c", "a", "b"], ["a"])).toEqual(["c", "b"]);
  });
});
