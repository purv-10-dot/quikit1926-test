import { describe, it, expect } from "vitest";
import {
  SUPPORTED_FIELDS,
  UNSUPPORTED_FIELD_ROWS,
  EXAMPLE_CATEGORIES,
} from "@/app/(dashboard)/settings/tql-help/tql-help-meta";
import { NATIVE_FIELDS, UNSUPPORTED_FIELDS } from "@/lib/tql/fields";
import { parse } from "@/lib/tql/parser";
import { translate } from "@/lib/tql/translator";
import { TqlParseError } from "@/lib/tql/errors";

/**
 * The whole point of sourcing the help page's field tables from lib/tql/fields.ts
 * is that docs and behavior can't drift apart. These tests fail if that ever
 * stops being true — e.g. someone edits the page's data inline instead of the
 * shared source, or adds a field to one place and not the other.
 */
describe("tql-help-meta — stays in sync with lib/tql/fields.ts", () => {
  it("every SUPPORTED_FIELDS row corresponds to an actual NATIVE_FIELDS entry", () => {
    const nativeNames = new Set(Object.values(NATIVE_FIELDS).map((f) => f.name));
    for (const row of SUPPORTED_FIELDS) {
      expect(nativeNames.has(row.field)).toBe(true);
    }
    expect(SUPPORTED_FIELDS).toHaveLength(Object.keys(NATIVE_FIELDS).length);
  });

  it("every UNSUPPORTED_FIELD_ROWS entry matches lib/tql/fields.ts's UNSUPPORTED_FIELDS map exactly", () => {
    expect(UNSUPPORTED_FIELD_ROWS).toHaveLength(Object.keys(UNSUPPORTED_FIELDS).length);
    for (const row of UNSUPPORTED_FIELD_ROWS) {
      expect(UNSUPPORTED_FIELDS[row.field]).toBe(row.reason);
    }
  });

  it("no field appears in both the supported and unsupported lists", () => {
    const supported = new Set(SUPPORTED_FIELDS.map((r) => r.field));
    for (const row of UNSUPPORTED_FIELD_ROWS) {
      expect(supported.has(row.field)).toBe(false);
    }
  });
});

// Mirrors what the real API route always supplies (see app/api/filters/[id]/route.ts)
// — a lookup over the org's actual custom fields. The doc's own examples
// reference these three names, so the fixture defines exactly those (a
// "Nonexistent Field" lookup correctly finds nothing, same as in production).
const CUSTOM_FIELDS_FIXTURE: Record<string, { id: string; type: string }> = {
  "Customer Tier": { id: "field-1", type: "SHORT_TEXT" },
  "Story Points Estimate": { id: "field-2", type: "NUMBER" },
  "Due Reminder": { id: "field-3", type: "DATE" },
  // cf[42] in the docs demonstrates looking a field up by id rather than by
  // name — same field as "Customer Tier", reachable both ways.
  "42": { id: "42", type: "SHORT_TEXT" },
};
const CTX = {
  userId: "user-1",
  resolveCustomField: (ref: string) => CUSTOM_FIELDS_FIXTURE[ref],
};
const INVALID_CATEGORY = "Deliberately invalid — confirms error handling";

describe("tql-help-meta — every worked example either translates or fails as documented", () => {
  for (const cat of EXAMPLE_CATEGORIES) {
    const shouldThrow = cat.category === INVALID_CATEGORY;
    for (const ex of cat.examples) {
      it(`[${cat.category}] "${ex.query}"`, () => {
        if (shouldThrow) {
          expect(() => translate(parse(ex.query), CTX)).toThrow(TqlParseError);
        } else {
          expect(() => translate(parse(ex.query), CTX)).not.toThrow();
        }
      });
    }
  }

  it("every category name is unique", () => {
    const names = EXAMPLE_CATEGORIES.map((c) => c.category);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every example query is unique across all categories", () => {
    const queries = EXAMPLE_CATEGORIES.flatMap((c) => c.examples.map((e) => e.query));
    expect(new Set(queries).size).toBe(queries.length);
  });
});

describe("tql-help-meta — every UNSUPPORTED_FIELD_ROWS entry actually throws from the translator", () => {
  for (const row of UNSUPPORTED_FIELD_ROWS) {
    it(`"${row.field}" is rejected with its documented reason`, () => {
      try {
        translate(parse(`${row.field} = "x"`), CTX);
        throw new Error(`expected ${row.field} to be rejected`);
      } catch (e) {
        expect(e).toBeInstanceOf(TqlParseError);
        expect((e as Error).message).toContain(row.reason);
      }
    });
  }
});
