import { describe, it, expect } from "vitest";
import { assetStatusAfterReturn, requestStateAfterUnfulfil } from "../../lib/api/assignments";

describe("assetStatusAfterReturn", () => {
  it("frees an Assigned asset back to Available", () => {
    expect(assetStatusAfterReturn("Assigned")).toBe("Available");
  });
  it("leaves non-Assigned states untouched (no clobber)", () => {
    expect(assetStatusAfterReturn("InRepair")).toBeNull();
    expect(assetStatusAfterReturn("Retired")).toBeNull();
    expect(assetStatusAfterReturn("Available")).toBeNull();
  });
});

describe("requestStateAfterUnfulfil", () => {
  it("Fulfilled with 1 unit → Approved / 0", () => {
    expect(requestStateAfterUnfulfil(1, "Fulfilled")).toEqual({ quantityFulfilled: 0, status: "Approved" });
  });
  it("Fulfilled with 2 units → PartiallyFulfilled / 1", () => {
    expect(requestStateAfterUnfulfil(2, "Fulfilled")).toEqual({ quantityFulfilled: 1, status: "PartiallyFulfilled" });
  });
  it("PartiallyFulfilled with 1 unit → Approved / 0", () => {
    expect(requestStateAfterUnfulfil(1, "PartiallyFulfilled")).toEqual({ quantityFulfilled: 0, status: "Approved" });
  });
  it("floors quantityFulfilled at 0 and still normalizes status", () => {
    expect(requestStateAfterUnfulfil(0, "Fulfilled")).toEqual({ quantityFulfilled: 0, status: "Approved" });
  });
  it("leaves unrelated statuses alone (only counter decrements)", () => {
    expect(requestStateAfterUnfulfil(3, "Approved")).toEqual({ quantityFulfilled: 2, status: "Approved" });
  });
});
