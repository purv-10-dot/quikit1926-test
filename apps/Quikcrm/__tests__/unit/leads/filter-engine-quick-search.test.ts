import { describe, expect, it } from "vitest";
import {
  LEAD_QUICK_SEARCH_COLUMNS,
  LEAD_QUICK_SEARCH_FIELD,
  buildLeadQuickSearchWhere,
  translateFilterToPrismaWhere,
} from "@/lib/services/leads/filter-engine";

describe("lead filter quick search", () => {
  it("buildLeadQuickSearchWhere ORs name, email, company, and related columns", () => {
    const where = buildLeadQuickSearchWhere("acme@example.com");
    expect(where).toEqual({
      OR: LEAD_QUICK_SEARCH_COLUMNS.map((field) => ({
        [field]: { contains: "acme@example.com", mode: "insensitive" },
      })),
    });
  });

  it("translateFilterToPrismaWhere ANDs quick search with other quick filters", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [
        { field: LEAD_QUICK_SEARCH_FIELD, operator: "contains", value: "Acme Corp" },
        { field: "stage", operator: "eq", value: "New" },
      ],
    });

    expect(where).toEqual({
      AND: [
        buildLeadQuickSearchWhere("Acme Corp"),
        { stage: { equals: "New", mode: "insensitive" } },
      ],
    });
  });

  it("ignores empty quick search terms", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [{ field: LEAD_QUICK_SEARCH_FIELD, operator: "contains", value: "   " }],
    });
    expect(where).toEqual({});
  });
});
