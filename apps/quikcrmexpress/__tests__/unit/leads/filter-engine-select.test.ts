import { describe, expect, it } from "vitest";
import { translateFilterToPrismaWhere } from "@/lib/services/leads/filter-engine";

describe("lead filter select fields", () => {
  it("uses case-insensitive equals for stage eq", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [{ field: "stage", operator: "eq", value: "Demo Scheduled" }],
    });
    expect(where).toEqual({
      stage: { equals: "Demo Scheduled", mode: "insensitive" },
    });
  });

  it("uses case-insensitive equals for status eq", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [{ field: "status", operator: "eq", value: "Open" }],
    });
    expect(where).toEqual({
      status: { equals: "Open", mode: "insensitive" },
    });
  });
});
