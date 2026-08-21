import { describe, it, expect } from "vitest";
import { resolveFunction } from "@/lib/tql/functions";
import { TqlParseError } from "@/lib/tql/tokenizer";

const NOW = new Date("2026-06-24T15:30:00.000Z"); // Wednesday
const CTX = { userId: "user-1", now: NOW };
const POS = { pos: 0, line: 1, col: 1 };

describe("resolveFunction", () => {
  it("currentUser() resolves to ctx.userId", () => {
    expect(resolveFunction("currentUser", [], CTX, POS)).toBe("user-1");
  });

  it("now() resolves to ctx.now", () => {
    expect(resolveFunction("now", [], CTX, POS)).toEqual(NOW);
  });

  it("startOfDay() resolves to midnight UTC today", () => {
    expect(resolveFunction("startOfDay", [], CTX, POS)).toEqual(new Date("2026-06-24T00:00:00.000Z"));
  });

  it("startOfDay(-1) resolves to midnight UTC yesterday", () => {
    expect(resolveFunction("startOfDay", [{ kind: "literal", value: "-1" }], CTX, POS)).toEqual(
      new Date("2026-06-23T00:00:00.000Z"),
    );
  });

  it("endOfDay() resolves to the last millisecond of today", () => {
    expect(resolveFunction("endOfDay", [], CTX, POS)).toEqual(new Date("2026-06-24T23:59:59.999Z"));
  });

  it("startOfWeek() resolves to the most recent Sunday UTC", () => {
    expect(resolveFunction("startOfWeek", [], CTX, POS)).toEqual(new Date("2026-06-21T00:00:00.000Z"));
  });

  it("endOfWeek() resolves to the last millisecond of Saturday", () => {
    expect(resolveFunction("endOfWeek", [], CTX, POS)).toEqual(new Date("2026-06-27T23:59:59.999Z"));
  });

  it("startOfMonth() resolves to the 1st of the current month UTC", () => {
    expect(resolveFunction("startOfMonth", [], CTX, POS)).toEqual(new Date("2026-06-01T00:00:00.000Z"));
  });

  it("startOfMonth(-1) resolves to the 1st of the previous month", () => {
    expect(resolveFunction("startOfMonth", [{ kind: "literal", value: "-1" }], CTX, POS)).toEqual(
      new Date("2026-05-01T00:00:00.000Z"),
    );
  });

  it("endOfMonth() resolves to the last millisecond of the current month", () => {
    expect(resolveFunction("endOfMonth", [], CTX, POS)).toEqual(new Date("2026-06-30T23:59:59.999Z"));
  });

  it("startOfYear() resolves to Jan 1 UTC", () => {
    expect(resolveFunction("startOfYear", [], CTX, POS)).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("endOfYear() resolves to Dec 31 23:59:59.999 UTC", () => {
    expect(resolveFunction("endOfYear", [], CTX, POS)).toEqual(new Date("2026-12-31T23:59:59.999Z"));
  });

  it("startOfYear(1) resolves to next year", () => {
    expect(resolveFunction("startOfYear", [{ kind: "literal", value: "1" }], CTX, POS)).toEqual(
      new Date("2027-01-01T00:00:00.000Z"),
    );
  });

  it("openSprints() resolves to null (special-cased by the translator, not a scalar)", () => {
    expect(resolveFunction("openSprints", [], CTX, POS)).toBeNull();
  });

  it("is case-insensitive on function name", () => {
    expect(resolveFunction("CURRENTUSER", [], CTX, POS)).toBe("user-1");
  });

  it("throws TqlParseError for an unknown function", () => {
    expect(() => resolveFunction("bogusFn", [], CTX, POS)).toThrow(TqlParseError);
  });

  it("throws TqlParseError when the offset argument isn't a literal", () => {
    expect(() =>
      resolveFunction("startOfDay", [{ kind: "function", name: "now", args: [] }], CTX, POS),
    ).toThrow(TqlParseError);
  });

  it("throws TqlParseError when the offset argument isn't numeric", () => {
    expect(() => resolveFunction("startOfDay", [{ kind: "literal", value: "abc" }], CTX, POS)).toThrow(
      TqlParseError,
    );
  });

  it("defaults ctx.now to `new Date()` when omitted", () => {
    const result = resolveFunction("now", [], { userId: "u" }, POS);
    expect(result).toBeInstanceOf(Date);
  });
});
