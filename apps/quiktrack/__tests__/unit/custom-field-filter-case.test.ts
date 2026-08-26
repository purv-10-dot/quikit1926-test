import { describe, it, expect } from "vitest";
import { customFiltersToWhere } from "@/lib/customFields/filterQuery";

/**
 * Regression: the `equals` operator compared `valueText` exactly, so a custom
 * text field holding "Task" was invisible to a filter typed as "task". `equals`
 * is only offered on SHORT_TEXT / LONG_TEXT / URL (see registry.ts) — free text,
 * hence case-insensitive. The id/option-valued operators stay exact.
 */
describe("customFiltersToWhere — case sensitivity", () => {
  it("matches `equals` on a text field case-insensitively", () => {
    expect(customFiltersToWhere([{ fieldId: "f1", type: "SHORT_TEXT", op: "equals", value: "task" }]))
      .toEqual([
        { fieldValues: { some: { fieldId: "f1", valueText: { equals: "task", mode: "insensitive" } } } },
      ]);
  });

  it("keeps `contains` case-insensitive", () => {
    expect(customFiltersToWhere([{ fieldId: "f1", type: "LONG_TEXT", op: "contains", value: "TaSk" }]))
      .toEqual([
        { fieldValues: { some: { fieldId: "f1", valueText: { contains: "TaSk", mode: "insensitive" } } } },
      ]);
  });

  it("leaves id-valued `is` exact — USER_PICKER stores a userId, not typed text", () => {
    expect(customFiltersToWhere([{ fieldId: "f1", type: "USER_PICKER", op: "is", value: "user-1" }]))
      .toEqual([{ fieldValues: { some: { fieldId: "f1", valueText: "user-1" } } }]);
  });

  it("leaves option-valued `in` exact — DROPDOWN_SINGLE values are picked, not typed", () => {
    expect(customFiltersToWhere([{ fieldId: "f1", type: "DROPDOWN_SINGLE", op: "in", value: ["High", "Low"] }]))
      .toEqual([{ fieldValues: { some: { fieldId: "f1", valueText: { in: ["High", "Low"] } } } }]);
  });
});

/**
 * gte/lte were added for TQL's cf[...] `>=`/`<=` support (lib/tql/translator.ts).
 * lt/gt/gte/lte all branch on f.type so a DATE-typed field compares valueDate
 * instead of valueNumber — matching the `between` operator's existing pattern.
 */
describe("customFiltersToWhere — numeric vs. date comparison operators", () => {
  it("lt/gt/gte/lte compare valueNumber for a NUMBER field", () => {
    expect(customFiltersToWhere([{ fieldId: "f1", type: "NUMBER", op: "lt", value: 5 }]))
      .toEqual([{ fieldValues: { some: { fieldId: "f1", valueNumber: { lt: 5 } } } }]);
    expect(customFiltersToWhere([{ fieldId: "f1", type: "NUMBER", op: "gt", value: 5 }]))
      .toEqual([{ fieldValues: { some: { fieldId: "f1", valueNumber: { gt: 5 } } } }]);
    expect(customFiltersToWhere([{ fieldId: "f1", type: "NUMBER", op: "gte", value: 5 }]))
      .toEqual([{ fieldValues: { some: { fieldId: "f1", valueNumber: { gte: 5 } } } }]);
    expect(customFiltersToWhere([{ fieldId: "f1", type: "NUMBER", op: "lte", value: 5 }]))
      .toEqual([{ fieldValues: { some: { fieldId: "f1", valueNumber: { lte: 5 } } } }]);
  });

  it("lt/gt/gte/lte compare valueDate for a DATE field", () => {
    expect(customFiltersToWhere([{ fieldId: "f1", type: "DATE", op: "gte", value: "2026-01-01" }]))
      .toEqual([{ fieldValues: { some: { fieldId: "f1", valueDate: { gte: new Date("2026-01-01") } } } }]);
    expect(customFiltersToWhere([{ fieldId: "f1", type: "DATE", op: "lte", value: "2026-01-01" }]))
      .toEqual([{ fieldValues: { some: { fieldId: "f1", valueDate: { lte: new Date("2026-01-01") } } } }]);
  });
});
