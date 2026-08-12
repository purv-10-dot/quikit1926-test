import { describe, expect, it } from "vitest";
import { buildAdvancedAccountWhere } from "@/lib/services/accounts";

describe("buildAdvancedAccountWhere", () => {
  it("maps date eq to a full-day range", () => {
    const where = buildAdvancedAccountWhere(
      [{ field: "renewalDate", operator: "eq", value: "2024-06-15" }],
      "AND",
    );
    // buildAdvancedAccountWhere wraps conditions in the combinator: { AND: [...] }.
    expect(where).toMatchObject({
      AND: [{ renewalDate: { gte: expect.any(Date), lte: expect.any(Date) } }],
    });
    const rd = (where as { AND: Array<{ renewalDate: { gte: Date; lte: Date } }> }).AND[0]!.renewalDate;
    expect(rd.gte.getHours()).toBe(0);
    expect(rd.lte.getHours()).toBe(23);
  });

  it("uses case-insensitive equals for status", () => {
    const where = buildAdvancedAccountWhere(
      [{ field: "status", operator: "eq", value: "Active" }],
      "AND",
    );
    expect(where).toEqual({
      AND: [{ status: { equals: "Active", mode: "insensitive" } }],
    });
  });
});
