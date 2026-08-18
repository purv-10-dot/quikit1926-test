import { describe, it, expect } from "vitest";
import { parse, TqlParseError } from "@/lib/tql/parser";

describe("parse — grouping and precedence", () => {
  it("binds AND tighter than OR (a OR b AND c === a OR (b AND c))", () => {
    const { where } = parse('a = "1" OR b = "2" AND c = "3"');
    expect(where).toMatchObject({
      kind: "or",
      clauses: [
        { kind: "comparison", field: { name: "a" } },
        {
          kind: "and",
          clauses: [
            { kind: "comparison", field: { name: "b" } },
            { kind: "comparison", field: { name: "c" } },
          ],
        },
      ],
    });
  });

  it("parentheses override default precedence", () => {
    const { where } = parse('(a = "1" OR b = "2") AND c = "3"');
    expect(where).toMatchObject({
      kind: "and",
      clauses: [
        {
          kind: "or",
          clauses: [
            { kind: "comparison", field: { name: "a" } },
            { kind: "comparison", field: { name: "b" } },
          ],
        },
        { kind: "comparison", field: { name: "c" } },
      ],
    });
  });

  it("parses standalone NOT applied to a group", () => {
    const { where } = parse('NOT (a = "1" OR b = "2")');
    expect(where).toMatchObject({
      kind: "not",
      clause: { kind: "or" },
    });
  });

  it("parses IN with multiple values", () => {
    const { where } = parse('status IN ("To Do","In Progress")');
    expect(where).toMatchObject({
      kind: "in",
      field: { name: "status" },
      negate: false,
      values: [{ kind: "literal", value: "To Do" }, { kind: "literal", value: "In Progress" }],
    });
  });

  it("parses NOT IN", () => {
    const { where } = parse('status NOT IN ("Done")');
    expect(where).toMatchObject({ kind: "in", field: { name: "status" }, negate: true });
  });

  it("parses IS EMPTY and IS NOT EMPTY", () => {
    const { where: w1 } = parse("assignee IS EMPTY");
    expect(w1).toMatchObject({ kind: "empty", field: { name: "assignee" }, negate: false });
    const { where: w2 } = parse("assignee IS NOT EMPTY");
    expect(w2).toMatchObject({ kind: "empty", field: { name: "assignee" }, negate: true });
  });

  it("parses a cf[id] field reference", () => {
    const { where } = parse('cf[123] = "x"');
    expect(where).toMatchObject({ field: { kind: "customField", ref: "123" } });
  });

  it("parses a cf[\"Name\"] field reference", () => {
    const { where } = parse('cf["Customer Tier"] = "Gold"');
    expect(where).toMatchObject({ field: { kind: "customField", ref: "Customer Tier" } });
  });

  it("parses a function-call value", () => {
    const { where } = parse("assignee = currentUser()");
    expect(where).toMatchObject({
      kind: "comparison",
      value: { kind: "function", name: "currentUser", args: [] },
    });
  });

  it("parses a function-call value with an argument", () => {
    const { where } = parse('created >= startOfDay("-1")');
    expect(where).toMatchObject({
      kind: "comparison",
      value: { kind: "function", name: "startOfDay", args: [{ kind: "literal", value: "-1" }] },
    });
  });

  it("parses a bare identifier value (e.g. assignee = me)", () => {
    const { where } = parse("assignee = me");
    expect(where).toMatchObject({ value: { kind: "literal", value: "me" } });
  });

  it("parses a multi-argument function call", () => {
    const { where } = parse('cf[1] = cascadeOption("a", "b")');
    expect(where).toMatchObject({
      value: {
        kind: "function",
        name: "cascadeOption",
        args: [{ kind: "literal", value: "a" }, { kind: "literal", value: "b" }],
      },
    });
  });

  it("parses ORDER BY with an explicit direction", () => {
    const { orderBy } = parse('status = "x" ORDER BY updated DESC');
    expect(orderBy).toEqual([{ field: { kind: "native", name: "updated" }, dir: "DESC" }]);
  });

  it("defaults ORDER BY direction to ASC when omitted", () => {
    const { orderBy } = parse('status = "x" ORDER BY updated');
    expect(orderBy).toEqual([{ field: { kind: "native", name: "updated" }, dir: "ASC" }]);
  });

  it("parses multiple ORDER BY clauses", () => {
    const { orderBy } = parse('status = "x" ORDER BY priority DESC, updated ASC');
    expect(orderBy).toEqual([
      { field: { kind: "native", name: "priority" }, dir: "DESC" },
      { field: { kind: "native", name: "updated" }, dir: "ASC" },
    ]);
  });

  it("allows a bare ORDER BY with no where clause", () => {
    const { where, orderBy } = parse("ORDER BY updated DESC");
    expect(where).toBeNull();
    expect(orderBy).toEqual([{ field: { kind: "native", name: "updated" }, dir: "DESC" }]);
  });

  it("lower-cases native field names", () => {
    const { where } = parse('STATUS = "x"');
    expect(where).toMatchObject({ field: { name: "status" } });
  });

  it("throws TqlParseError with a position for a dangling operator", () => {
    try {
      parse("status =");
      throw new Error("expected parse to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TqlParseError);
      expect((e as TqlParseError).position.pos).toBe(8);
    }
  });

  it("throws TqlParseError when NOT isn't followed by IN", () => {
    expect(() => parse('status NOT = "x"')).toThrow(TqlParseError);
  });

  it("throws TqlParseError on trailing garbage after a valid query", () => {
    expect(() => parse('status = "x" bogus')).toThrow(TqlParseError);
  });

  it("throws TqlParseError on an unmatched paren", () => {
    expect(() => parse('(status = "x"')).toThrow(TqlParseError);
  });

  it("throws TqlParseError on an empty query with dangling AND", () => {
    expect(() => parse('status = "x" AND')).toThrow(TqlParseError);
  });
});
