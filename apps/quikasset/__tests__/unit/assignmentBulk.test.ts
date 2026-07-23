import { describe, it, expect } from "vitest";
import { findDuplicateAssetId, partitionAssignable } from "../../lib/api/assignmentBulk";

describe("findDuplicateAssetId", () => {
  it("returns null when all ids are unique", () => {
    expect(findDuplicateAssetId(["a", "b", "c"])).toBeNull();
  });
  it("returns null for an empty list", () => {
    expect(findDuplicateAssetId([])).toBeNull();
  });
  it("returns the first id that repeats", () => {
    expect(findDuplicateAssetId(["a", "b", "a", "c"])).toBe("a");
  });
});

describe("partitionAssignable", () => {
  const assets = [
    { id: "a1", assetStatus: "Available", condition: "Good", itemName: "L1" },
    { id: "a2", assetStatus: "Assigned", condition: "Fair", itemName: "L2" },
    { id: "a3", assetStatus: "InRepair", condition: "Poor", itemName: "L3" },
  ];

  it("splits requested ids into missing / unavailable / assignable", () => {
    const r = partitionAssignable(["a1", "a2", "a3", "a4"], assets);
    expect(r.assignable.map((a) => a.id)).toEqual(["a1"]);
    expect(r.unavailable.map((a) => a.id)).toEqual(["a2", "a3"]);
    expect(r.missing).toEqual(["a4"]);
  });

  it("all assignable when every requested asset is Available", () => {
    const r = partitionAssignable(["a1"], assets);
    expect(r.missing).toEqual([]);
    expect(r.unavailable).toEqual([]);
    expect(r.assignable).toHaveLength(1);
  });

  it("preserves each asset's condition on assignable rows", () => {
    const r = partitionAssignable(["a1"], assets);
    expect(r.assignable[0]?.condition).toBe("Good");
  });
});
