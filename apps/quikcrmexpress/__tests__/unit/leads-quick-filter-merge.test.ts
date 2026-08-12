import { describe, expect, it } from "vitest";
import { mergeLeadQuickFilters } from "@/lib/leads/quick-filter-merge";

describe("mergeLeadQuickFilters", () => {
  const advanced = {
    matchMode: "ALL" as const,
    conditions: [{ field: "name", operator: "eq" as const, value: "ewfef" }],
  };

  it("keeps advanced name condition when toolbar search is empty", () => {
    const composed = mergeLeadQuickFilters(advanced, {
      search: "",
      stage: "",
      ownerName: "",
      mineOnly: false,
    });
    expect(composed.conditions).toEqual(advanced.conditions);
  });

  it("drops advanced name condition when toolbar search is active", () => {
    const composed = mergeLeadQuickFilters(advanced, {
      search: "acme",
      stage: "",
      ownerName: "",
      mineOnly: false,
    });
    expect(composed.conditions).toEqual([]);
  });
});
