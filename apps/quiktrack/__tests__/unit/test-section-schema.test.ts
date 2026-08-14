import { describe, expect, it } from "vitest";
import {
  createSectionSchema,
  updateSectionSchema,
} from "@/lib/validation/testCase";

/**
 * Regression tests for the section schemas.
 *
 * The first case here is a real bug that reached the UI: creating a ROOT-level
 * folder sends `parentId: null` explicitly, but the schema declared
 * `.optional()` — which accepts `undefined` and rejects `null`. The "Add folder"
 * button failed with "Expected string, received null".
 *
 * The distinction matters beyond this one field: for an id, `undefined` means
 * "not specified" while `null` means "explicitly none" (root / unassigned), and
 * the two are not interchangeable.
 */

describe("createSectionSchema", () => {
  it("accepts parentId: null — a root-level folder", () => {
    const result = createSectionSchema.safeParse({
      suiteId: "su1",
      parentId: null,
      name: "Login",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a parent id for a nested folder", () => {
    expect(
      createSectionSchema.safeParse({
        suiteId: "su1",
        parentId: "se1",
        name: "Login",
      }).success,
    ).toBe(true);
  });

  it("accepts an omitted parentId", () => {
    expect(
      createSectionSchema.safeParse({ suiteId: "su1", name: "Login" }).success,
    ).toBe(true);
  });

  it("rejects an empty-string parentId, which is not a valid id", () => {
    expect(
      createSectionSchema.safeParse({
        suiteId: "su1",
        parentId: "",
        name: "Login",
      }).success,
    ).toBe(false);
  });

  it("rejects a blank name", () => {
    expect(
      createSectionSchema.safeParse({ suiteId: "su1", name: "   " }).success,
    ).toBe(false);
  });

  it("requires a suiteId", () => {
    expect(createSectionSchema.safeParse({ name: "Login" }).success).toBe(false);
  });

  it("trims the name", () => {
    const result = createSectionSchema.safeParse({
      suiteId: "su1",
      name: "  Login  ",
    });
    expect(result.success && result.data.name).toBe("Login");
  });
});

describe("updateSectionSchema", () => {
  it("accepts parentId: null to move a section to the suite root", () => {
    expect(updateSectionSchema.safeParse({ parentId: null }).success).toBe(true);
  });

  it("accepts an orderNo-only reorder", () => {
    expect(updateSectionSchema.safeParse({ orderNo: 3 }).success).toBe(true);
  });

  it("accepts an empty patch — every field is optional", () => {
    expect(updateSectionSchema.safeParse({}).success).toBe(true);
  });
});
