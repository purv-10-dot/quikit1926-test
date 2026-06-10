import { describe, expect, it } from "vitest";
import {
  buildAdvancedOpportunityWhere,
  buildOpportunityQuickSearchWhere,
} from "@/lib/services/opportunities/filter-engine";

describe("opportunity filter-engine", () => {
  it("quick search matches name, owner, and account", () => {
    const w = buildOpportunityQuickSearchWhere("acme");
    expect(w?.OR).toHaveLength(3);
  });

  it("stage eq builds insensitive filter", () => {
    const w = buildAdvancedOpportunityWhere(
      [{ field: "stage", operator: "eq", value: "Proposal" }],
      "AND",
    );
    expect(w).toEqual({ AND: [{ stage: { equals: "Proposal", mode: "insensitive" } }] });
  });

  it("accountName contains uses relation", () => {
    const w = buildAdvancedOpportunityWhere(
      [{ field: "accountName", operator: "contains", value: "Globex" }],
      "AND",
    );
    expect(w).toEqual({
      AND: [{ account: { name: { contains: "Globex", mode: "insensitive" } } }],
    });
  });
});
