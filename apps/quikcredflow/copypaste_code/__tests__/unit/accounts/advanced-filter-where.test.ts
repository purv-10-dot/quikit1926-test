import { describe, expect, it } from "vitest";
import { buildAdvancedAccountWhere } from "@/lib/services/accounts";

describe("buildAdvancedAccountWhere", () => {
  it("maps date eq to a full-day range", () => {
    const where = buildAdvancedAccountWhere(
      [{ field: "renewalDate", operator: "eq", value: "2024-06-15" }],
      "AND",
    );
    expect(where).toMatchObject({
      renewalDate: {
        gte: expect.any(Date),
        lte: expect.any(Date),
      },
    });
    const gte = (where as { renewalDate: { gte: Date; lte: Date } }).renewalDate.gte;
    const lte = (where as { renewalDate: { gte: Date; lte: Date } }).renewalDate.lte;
    expect(gte.getHours()).toBe(0);
    expect(lte.getHours()).toBe(23);
  });

  it("uses case-insensitive equals for status", () => {
    const where = buildAdvancedAccountWhere(
      [{ field: "status", operator: "eq", value: "Active" }],
      "AND",
    );
    expect(where).toEqual({
      status: { equals: "Active", mode: "insensitive" },
    });
  });
});
