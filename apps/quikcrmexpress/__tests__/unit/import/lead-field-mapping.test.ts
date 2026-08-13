import { describe, expect, it } from "vitest";
import { resolveImportRow, IMPORTABLE_STANDARD_KEYS } from "@/lib/services/import/lead-field-mapping";
import { STANDARD_LEAD_FIELDS, type LeadFieldDefinition } from "@/types/field-definition";

const CUSTOM: LeadFieldDefinition[] = [
  { key: "budget", label: "Budget", fieldType: "Number", requirement: "Optional", visible: true, isStandard: false },
  {
    key: "interests", label: "Interests", fieldType: "MultiSelect", requirement: "Optional",
    visible: true, isStandard: false, options: ["X", "Y", "Z"],
  },
];
const DEFS = [...STANDARD_LEAD_FIELDS, ...CUSTOM];

describe("resolveImportRow", () => {
  it("matches headers to field key OR label and splits standard vs custom (no columnMap)", () => {
    const { standard, dynamicInput } = resolveImportRow(
      { name: "Acme", Email: "a@b.com", Budget: "5000", Interests: "X;Y", blank: "" },
      null,
      DEFS,
    );
    expect(standard).toEqual({ name: "Acme", email: "a@b.com" });
    expect(dynamicInput).toEqual({ budget: "5000", interests: ["X", "Y"] });
  });

  it("uses an explicit columnMap when provided", () => {
    const { standard, dynamicInput } = resolveImportRow(
      { c1: "Acme", c2: "7000", c3: "ignored" },
      { c1: "name", c2: "budget" },
      DEFS,
    );
    expect(standard).toEqual({ name: "Acme" });
    expect(dynamicInput).toEqual({ budget: "7000" });
  });

  it("ignores standard keys that are not real importable Lead columns (e.g. score)", () => {
    expect(IMPORTABLE_STANDARD_KEYS.has("score")).toBe(false);
    const { standard, dynamicInput } = resolveImportRow({ name: "X", score: "99" }, null, DEFS);
    expect(standard).toEqual({ name: "X" });
    expect(dynamicInput).toEqual({});
  });

  it("skips empty/whitespace cells and unknown headers", () => {
    const { standard, dynamicInput } = resolveImportRow(
      { name: "  Trimmed Co ", email: "   ", totallyUnknownHeader: "v" },
      null,
      DEFS,
    );
    expect(standard).toEqual({ name: "Trimmed Co" });
    expect(dynamicInput).toEqual({});
  });

  it("supports a newly-added custom field with zero code change (future-proof)", () => {
    const withNewField = [
      ...DEFS,
      { key: "referralSource", label: "Referral Source", fieldType: "Text", requirement: "Optional", visible: true, isStandard: false } as LeadFieldDefinition,
    ];
    const { dynamicInput } = resolveImportRow(
      { name: "Z", "Referral Source": "Partner A" },
      null,
      withNewField,
    );
    expect(dynamicInput).toEqual({ referralSource: "Partner A" });
  });
});
