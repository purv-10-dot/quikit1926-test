import { describe, expect, it } from "vitest";
import { translateFilterToPrismaWhere } from "@/lib/services/leads/filter-engine";
import { Prisma } from "@quikit/database";
import { DEFAULT_OPERATORS } from "@/types/lead-filter";
import type { LeadFieldDefinition } from "@/types/field-definition";

/**
 * Fix 2 — custom-field isEmpty must catch absent keys, not just JSON null.
 *
 * The engine emits a Prisma `where` fragment (it does not hit the DB), so these
 * assert the SHAPE: isEmpty must use Prisma.AnyNull (matches absent key OR JSON
 * null), and isNotEmpty must be its negation. The live 140/1 behavior on real
 * data was proven separately against the dev DB (see SESSION_LOG 2026-07-09).
 */
const customDefs: LeadFieldDefinition[] = [
  {
    key: "demo_date",
    label: "Demo Date",
    fieldType: "Date",
    requirement: "Optional",
    isStandard: false,
    visible: true,
    showInList: false,
  },
  {
    key: "accounting_software",
    label: "Accounting Software",
    fieldType: "Select",
    requirement: "Optional",
    isStandard: false,
    visible: true,
    showInList: false,
    options: ["tally", "busy", "marg"],
  },
];

describe("custom-field isEmpty / isNotEmpty (Fix 2 — absent-key)", () => {
  it("isEmpty uses Prisma.AnyNull (matches absent key OR JSON null)", () => {
    const where = translateFilterToPrismaWhere(
      { matchMode: "ALL", conditions: [{ field: "demo_date", operator: "isEmpty" }] },
      customDefs,
    );
    expect(where).toEqual({
      dynamicFields: { path: ["demo_date"], equals: Prisma.AnyNull },
    });
  });

  it("isNotEmpty is the negation of the AnyNull match", () => {
    const where = translateFilterToPrismaWhere(
      { matchMode: "ALL", conditions: [{ field: "demo_date", operator: "isNotEmpty" }] },
      customDefs,
    );
    expect(where).toEqual({
      NOT: { dynamicFields: { path: ["demo_date"], equals: Prisma.AnyNull } },
    });
  });

  it("does NOT use a plain equals:null (the old bug that missed absent keys)", () => {
    const where = translateFilterToPrismaWhere(
      { matchMode: "ALL", conditions: [{ field: "demo_date", operator: "isEmpty" }] },
      customDefs,
    ) as { dynamicFields?: { equals?: unknown } };
    // The old broken form was `equals: null`. AnyNull is a Prisma symbol, not null.
    expect(where.dynamicFields?.equals).not.toBeNull();
    expect(where.dynamicFields?.equals).toBe(Prisma.AnyNull);
  });

  it("applies AnyNull regardless of custom field type (Select too)", () => {
    const where = translateFilterToPrismaWhere(
      { matchMode: "ALL", conditions: [{ field: "accounting_software", operator: "isEmpty" }] },
      customDefs,
    );
    expect(where).toEqual({
      dynamicFields: { path: ["accounting_software"], equals: Prisma.AnyNull },
    });
  });

  it("date fields expose isEmpty/isNotEmpty in the UI operator list", () => {
    // The engine handles isEmpty for dates (operator check precedes the type
    // branch), but the operators must also be offered in the dropdown. Guard
    // against a future edit silently dropping them from the date list.
    expect(DEFAULT_OPERATORS.date).toContain("isEmpty");
    expect(DEFAULT_OPERATORS.date).toContain("isNotEmpty");
  });
});
