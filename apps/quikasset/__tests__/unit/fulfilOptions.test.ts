import { describe, it, expect } from "vitest";
import { buildFulfilAssetOptions } from "../../lib/assetRequests";
import type { Asset } from "@/types/asset";

/**
 * Physical Fulfil picker options: must offer ONLY Available stock whose category
 * matches the request (so a Laptop request can't be fulfilled with a Chair) and
 * expose the serial number so identical-model units are distinguishable.
 */
const asset = (over: Partial<Asset>): Asset =>
  ({
    id: "a", itemName: "Item", itemCode: "IC", serialNumber: "SN",
    assetStatus: "Available", categoryId: "cat-laptop",
    ...over,
  } as Asset);

describe("buildFulfilAssetOptions", () => {
  const laptopReq = { categoryId: "cat-laptop" };

  it("excludes assets that are not Available", () => {
    const assets = [
      asset({ id: "a1", assetStatus: "Available", categoryId: "cat-laptop" }),
      asset({ id: "a2", assetStatus: "Assigned", categoryId: "cat-laptop" }),
    ];
    expect(buildFulfilAssetOptions(assets, laptopReq).map((o) => o.value)).toEqual(["a1"]);
  });

  it("excludes Available assets whose category does not match the request", () => {
    const assets = [
      asset({ id: "laptop", assetStatus: "Available", categoryId: "cat-laptop" }),
      asset({ id: "chair", assetStatus: "Available", categoryId: "cat-chair" }),
    ];
    expect(buildFulfilAssetOptions(assets, laptopReq).map((o) => o.value)).toEqual(["laptop"]);
  });

  it("maps matching assets to Name (label) + Serial (sublabel)", () => {
    const assets = [
      asset({ id: "a1", itemName: "MacBook Pro", serialNumber: "C02XY123", categoryId: "cat-laptop" }),
    ];
    expect(buildFulfilAssetOptions(assets, laptopReq)).toEqual([
      { value: "a1", label: "MacBook Pro", sublabel: "C02XY123" },
    ]);
  });

  it("applies no category constraint when the request has no categoryId (legacy rows)", () => {
    const assets = [
      asset({ id: "laptop", assetStatus: "Available", categoryId: "cat-laptop" }),
      asset({ id: "chair", assetStatus: "Available", categoryId: "cat-chair" }),
    ];
    expect(buildFulfilAssetOptions(assets, { categoryId: null }).map((o) => o.value)).toEqual([
      "laptop",
      "chair",
    ]);
  });
});
