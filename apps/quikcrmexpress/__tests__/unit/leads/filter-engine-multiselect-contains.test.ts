import { describe, expect, it } from "vitest";
import { translateFilterToPrismaWhere } from "@/lib/services/leads/filter-engine";
import type { LeadFieldDefinition } from "@/types/field-definition";

/**
 * Fix 3 — MultiSelect custom fields match via array_contains, not equals.
 *
 * MultiSelect stores a JSON string array (e.g. ["Tally","Busy"]). The old code
 * shared the Select branch and used `equals`, which compares the WHOLE array to
 * a scalar — only matching a single-element array, missing multi-value leads.
 * These assert MultiSelect now emits array_contains while Select still uses
 * equals. Live behavior (contains "Tally"=2 incl. a multi-value lead) was proven
 * against the dev DB (see SESSION_LOG 2026-07-09/10).
 */
const customDefs: LeadFieldDefinition[] = [
  {
    key: "accounting_software",
    label: "Accounting Software",
    fieldType: "MultiSelect",
    requirement: "Optional",
    isStandard: false,
    visible: true,
    showInList: false,
    options: ["Tally", "Busy", "Marg", "Zoho"],
  },
  {
    key: "lead_tier",
    label: "Lead Tier",
    fieldType: "Select",
    requirement: "Optional",
    isStandard: false,
    visible: true,
    showInList: false,
    options: ["A", "B", "C"],
  },
];

describe("MultiSelect custom-field matching (Fix 3 — array_contains)", () => {
  it("eq on MultiSelect uses array_contains (matches value among many)", () => {
    const where = translateFilterToPrismaWhere(
      { matchMode: "ALL", conditions: [{ field: "accounting_software", operator: "eq", value: "Tally" }] },
      customDefs,
    );
    expect(where).toEqual({
      dynamicFields: { path: ["accounting_software"], array_contains: ["Tally"] },
    });
  });

  it("neq on MultiSelect negates array_contains", () => {
    const where = translateFilterToPrismaWhere(
      { matchMode: "ALL", conditions: [{ field: "accounting_software", operator: "neq", value: "Zoho" }] },
      customDefs,
    );
    expect(where).toEqual({
      NOT: { dynamicFields: { path: ["accounting_software"], array_contains: ["Zoho"] } },
    });
  });

  it("in on MultiSelect ORs array_contains across chosen values", () => {
    const where = translateFilterToPrismaWhere(
      { matchMode: "ALL", conditions: [{ field: "accounting_software", operator: "in", value: ["Tally", "Marg"] }] },
      customDefs,
    );
    expect(where).toEqual({
      OR: [
        { dynamicFields: { path: ["accounting_software"], array_contains: ["Tally"] } },
        { dynamicFields: { path: ["accounting_software"], array_contains: ["Marg"] } },
      ],
    });
  });

  it("does NOT use equals for MultiSelect (the old bug)", () => {
    const where = translateFilterToPrismaWhere(
      { matchMode: "ALL", conditions: [{ field: "accounting_software", operator: "eq", value: "Tally" }] },
      customDefs,
    ) as { dynamicFields?: Record<string, unknown> };
    expect(where.dynamicFields).not.toHaveProperty("equals");
    expect(where.dynamicFields).toHaveProperty("array_contains");
  });

  it("Select still uses equals (scalar), NOT array_contains", () => {
    const where = translateFilterToPrismaWhere(
      { matchMode: "ALL", conditions: [{ field: "lead_tier", operator: "eq", value: "A" }] },
      customDefs,
    );
    expect(where).toEqual({
      dynamicFields: { path: ["lead_tier"], equals: "A" },
    });
  });
});
