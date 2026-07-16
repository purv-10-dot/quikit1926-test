import { describe, it, expect } from "vitest";
import { selectAssignableAssets } from "../../lib/assetRequests";
import type { Asset } from "@/types/asset";

/**
 * Assign picker source list: must offer ONLY Available stock whose category
 * matches the request (a Laptop request can't be assigned a Chair), returning
 * full asset rows so the picker can show name / code / serial / condition.
 */
const asset = (over: Partial<Asset>): Asset =>
  ({
    id: "a", itemName: "Item", itemCode: "IC", serialNumber: "SN",
    assetStatus: "Available", categoryId: "cat-laptop", condition: "Good",
    ...over,
  } as Asset);

describe("selectAssignableAssets", () => {
  const laptopReq = { categoryId: "cat-laptop" };

  it("excludes assets that are not Available", () => {
    const assets = [
      asset({ id: "a1", assetStatus: "Available", categoryId: "cat-laptop" }),
      asset({ id: "a2", assetStatus: "Assigned", categoryId: "cat-laptop" }),
    ];
    expect(selectAssignableAssets(assets, laptopReq).map((a) => a.id)).toEqual(["a1"]);
  });

  it("excludes Available assets whose category does not match the request", () => {
    const assets = [
      asset({ id: "laptop", assetStatus: "Available", categoryId: "cat-laptop" }),
      asset({ id: "chair", assetStatus: "Available", categoryId: "cat-chair" }),
    ];
    expect(selectAssignableAssets(assets, laptopReq).map((a) => a.id)).toEqual(["laptop"]);
  });

  it("returns full rows (name/code/serial/condition) for matching assets", () => {
    const assets = [
      asset({ id: "a1", itemName: "MacBook Pro", itemCode: "LAP-001", serialNumber: "C02XY123", condition: "Good", categoryId: "cat-laptop" }),
    ];
    const [row] = selectAssignableAssets(assets, laptopReq);
    expect(row).toMatchObject({ id: "a1", itemName: "MacBook Pro", itemCode: "LAP-001", serialNumber: "C02XY123", condition: "Good" });
  });

  it("applies no category constraint when the request has no categoryId (legacy rows)", () => {
    const assets = [
      asset({ id: "laptop", assetStatus: "Available", categoryId: "cat-laptop" }),
      asset({ id: "chair", assetStatus: "Available", categoryId: "cat-chair" }),
    ];
    expect(selectAssignableAssets(assets, { categoryId: null }).map((a) => a.id)).toEqual(["laptop", "chair"]);
  });
});
