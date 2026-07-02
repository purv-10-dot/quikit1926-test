import { describe, expect, it } from "vitest";
import { updateLeadSchema } from "@/lib/validators/lead";

describe("updateLeadSchema — leadType", () => {
  // Regression: editing a lead with no leadType (e.g. created via the basic
  // form) previously failed with "Expected ... received null" because the
  // update schema had `.optional()` but not `.nullable()`, while the frontend
  // sends `leadType: leadType || null` when the field is blank.
  it("accepts leadType: null (blank field cleared on edit)", () => {
    const parsed = updateLeadSchema.safeParse({ leadType: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.leadType).toBeNull();
  });

  it("accepts a valid leadType enum value", () => {
    const parsed = updateLeadSchema.safeParse({ leadType: "Fixed Project" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.leadType).toBe("Fixed Project");
  });

  it("accepts an omitted leadType (partial update)", () => {
    const parsed = updateLeadSchema.safeParse({ name: "Acme" });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown leadType value", () => {
    const parsed = updateLeadSchema.safeParse({ leadType: "Bogus" });
    expect(parsed.success).toBe(false);
  });
});
