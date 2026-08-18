import { describe, it, expect } from "vitest";
import {
  SUPPORTED_FIELDS,
  UNSUPPORTED_FIELD_ROWS,
  EXAMPLES,
} from "@/app/(dashboard)/settings/tql-help/tql-help-meta";
import { NATIVE_FIELDS, UNSUPPORTED_FIELDS } from "@/lib/tql/fields";
import { parse } from "@/lib/tql/parser";
import { translate } from "@/lib/tql/translator";
import { TqlUnsupportedFieldError, TqlParseError } from "@/lib/tql/errors";

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

const CTX = { userId: "user-1" };

describe("tql-help-meta — every worked example either translates or fails as documented", () => {
  for (const ex of EXAMPLES) {
    it(`"${ex.query}"`, () => {
      const isDocumentedFailure = /will error/i.test(ex.description);
      if (isDocumentedFailure) {
        expect(() => translate(parse(ex.query), CTX)).toThrow(TqlUnsupportedFieldError);
      } else {
        expect(() => translate(parse(ex.query), CTX)).not.toThrow();
      }
    });
  }
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
