import { describe, it, expect } from "vitest";
import { NATIVE_FIELD_SUGGESTIONS, customFieldSuggestion } from "@/lib/tql/suggestions";
import { NATIVE_FIELDS } from "@/lib/tql/fields";

describe("NATIVE_FIELD_SUGGESTIONS", () => {
  it("has exactly one suggestion per canonical native field", () => {
    expect(NATIVE_FIELD_SUGGESTIONS).toHaveLength(Object.keys(NATIVE_FIELDS).length);
  });

  it("every suggestion's insertText is a real, parseable field name", () => {
    const names = new Set(Object.values(NATIVE_FIELDS).map((f) => f.name));
    for (const s of NATIVE_FIELD_SUGGESTIONS) {
      expect(names.has(s.insertText)).toBe(true);
      expect(s.kind).toBe("native");
    }
  });

  it("is sorted alphabetically", () => {
    const labels = NATIVE_FIELD_SUGGESTIONS.map((s) => s.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

describe("customFieldSuggestion", () => {
  it('wraps the name in cf["..."] for insertion', () => {
    const s = customFieldSuggestion("Customer Tier");
    expect(s.insertText).toBe('cf["Customer Tier"]');
    expect(s.label).toBe("Customer Tier");
    expect(s.kind).toBe("customField");
  });
});
