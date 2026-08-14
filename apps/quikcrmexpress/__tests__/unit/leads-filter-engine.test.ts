import { describe, expect, it } from "vitest";
import { translateFilterToPrismaWhere } from "@/lib/services/leads/filter-engine";
import type { LeadFieldDefinition } from "@/types/field-definition";

describe("translateFilterToPrismaWhere (leads)", () => {
  it("translates a text contains condition", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [{ field: "name", operator: "contains", value: "Acme" }],
    });
    expect(where).toEqual({ name: { contains: "Acme", mode: "insensitive" } });
  });

  it("combines conditions with OR when matchMode is ANY", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ANY",
      conditions: [
        { field: "stage", operator: "eq", value: "New" },
        { field: "stage", operator: "eq", value: "Qualified" },
      ],
    });
    // The engine applies case-insensitive equality to every string operator
    // (eq -> { equals, mode: "insensitive" }), consistent with `contains`.
    expect(where).toEqual({
      OR: [
        { stage: { equals: "New", mode: "insensitive" } },
        { stage: { equals: "Qualified", mode: "insensitive" } },
      ],
    });
  });

  it("translates boolean isTrue without a value", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [{ field: "isStarred", operator: "isTrue" }],
    });
    expect(where).toEqual({ isStarred: true });
  });

  it("translates custom field contains via dynamicFields JSON path", () => {
    const customDefs: LeadFieldDefinition[] = [
      {
        key: "custom_region",
        label: "Region",
        fieldType: "Text",
        requirement: "Optional",
        isStandard: false,
        visible: true,
        showInList: false,
      },
    ];
    const where = translateFilterToPrismaWhere(
      {
        matchMode: "ALL",
        conditions: [{ field: "custom_region", operator: "contains", value: "West" }],
      },
      customDefs,
    );
    expect(where).toEqual({
      dynamicFields: { path: ["custom_region"], string_contains: "West" },
    });
  });
});
