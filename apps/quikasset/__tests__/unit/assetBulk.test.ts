import { describe, it, expect } from "vitest";
import { findIntraBatchDuplicate, MAX_BULK_QUANTITY } from "../../lib/api/assetBulk";

describe("findIntraBatchDuplicate", () => {
  it("returns null for an internally-unique batch", () => {
    expect(
      findIntraBatchDuplicate([
        { itemCode: "A", serialNumber: "S1" },
        { itemCode: "B", serialNumber: "S2" },
      ]),
    ).toBeNull();
  });

  it("detects a duplicate itemCode with 1-based row numbers", () => {
    expect(
      findIntraBatchDuplicate([
        { itemCode: "A", serialNumber: "S1" },
        { itemCode: "B", serialNumber: "S2" },
        { itemCode: "A", serialNumber: "S3" },
      ]),
    ).toEqual({ field: "itemCode", value: "A", rows: [1, 3] });
  });

  it("detects a duplicate serialNumber", () => {
    expect(
      findIntraBatchDuplicate([
        { itemCode: "A", serialNumber: "S1" },
        { itemCode: "B", serialNumber: "S1" },
      ]),
    ).toEqual({ field: "serialNumber", value: "S1", rows: [1, 2] });
  });

  it("reports an itemCode duplicate before a serialNumber duplicate", () => {
    expect(
      findIntraBatchDuplicate([
        { itemCode: "A", serialNumber: "S1" },
        { itemCode: "A", serialNumber: "S1" },
      ])?.field,
    ).toBe("itemCode");
  });

  it("ignores blank values (those are caught by required checks)", () => {
    expect(
      findIntraBatchDuplicate([
        { itemCode: "", serialNumber: "" },
        { itemCode: "", serialNumber: "" },
      ]),
    ).toBeNull();
  });

  it("trims before comparing", () => {
    expect(
      findIntraBatchDuplicate([
        { itemCode: "A ", serialNumber: "S1" },
        { itemCode: " A", serialNumber: "S2" },
      ]),
    ).toEqual({ field: "itemCode", value: "A", rows: [1, 2] });
  });

  it("exposes a sane batch cap", () => {
    expect(MAX_BULK_QUANTITY).toBe(50);
  });
});
