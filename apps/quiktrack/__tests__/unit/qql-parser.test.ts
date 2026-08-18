import { describe, it, expect } from "vitest";
import { parseQql } from "@/lib/services/qql/parser";
import { QqlParseError } from "@/lib/services/qql/tokenizer";

describe("parseQql — grouping and precedence", () => {
  it("binds AND tighter than OR (a OR b AND c === a OR (b AND c))", () => {
    const { where } = parseQql('a = "1" OR b = "2" AND c = "3"');
    expect(where).toMatchObject({
      kind: "or",
      left: { kind: "comparison", field: "a", op: "=", value: "1" },
      right: {
        kind: "and",
        left: { kind: "comparison", field: "b", op: "=", value: "2" },
        right: { kind: "comparison", field: "c", op: "=", value: "3" },
      },
    });
  });

  it("parentheses override default precedence", () => {
    const { where } = parseQql('(a = "1" OR b = "2") AND c = "3"');
    expect(where).toMatchObject({
      kind: "and",
      left: {
        kind: "or",
        left: { kind: "comparison", field: "a" },
        right: { kind: "comparison", field: "b" },
      },
      right: { kind: "comparison", field: "c" },
    });
  });

  it("parses IN with multiple values", () => {
    const { where } = parseQql('status IN ("To Do","In Progress")');
    expect(where).toEqual({ kind: "in", field: "status", negate: false, values: ["To Do", "In Progress"], pos: 0 });
  });

  it("parses NOT IN", () => {
    const { where } = parseQql('status NOT IN ("Done")');
    expect(where).toMatchObject({ kind: "in", field: "status", negate: true, values: ["Done"] });
  });

  it("parses ORDER BY with an explicit direction", () => {
    const { orderBy } = parseQql('status = "x" ORDER BY updated DESC');
    expect(orderBy).toEqual({ field: "updated", dir: "DESC" });
  });

  it("defaults ORDER BY direction to ASC when omitted", () => {
    const { orderBy } = parseQql('status = "x" ORDER BY updated');
    expect(orderBy).toEqual({ field: "updated", dir: "ASC" });
  });

  it("allows a bare ORDER BY with no where clause", () => {
    const { where, orderBy } = parseQql("ORDER BY updated DESC");
    expect(where).toBeNull();
    expect(orderBy).toEqual({ field: "updated", dir: "DESC" });
  });

  it("lower-cases field names", () => {
    const { where } = parseQql('STATUS = "x"');
    expect(where).toMatchObject({ field: "status" });
  });

  it("throws QqlParseError with a position for a dangling operator", () => {
    try {
      parseQql("status =");
      throw new Error("expected parseQql to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(QqlParseError);
      expect((e as QqlParseError).position).toBe(8);
    }
  });

  it("throws QqlParseError when NOT isn't followed by IN", () => {
    expect(() => parseQql('status NOT = "x"')).toThrow(QqlParseError);
  });

  it("throws QqlParseError on trailing garbage after a valid query", () => {
    expect(() => parseQql('status = "x" bogus')).toThrow(QqlParseError);
  });
});
