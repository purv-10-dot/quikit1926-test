import { describe, it, expect } from "vitest";
import { tokenize, TqlParseError } from "@/lib/tql/tokenizer";

describe("tokenize", () => {
  it("tokenizes a simple comparison", () => {
    const tokens = tokenize('status = "To Do"');
    expect(tokens.map((t) => t.type)).toEqual(["IDENT", "OP", "STRING", "EOF"]);
    expect(tokens[0]).toMatchObject({ type: "IDENT", value: "status", pos: 0 });
    expect(tokens[1]).toMatchObject({ type: "OP", value: "=", pos: 7 });
    expect(tokens[2]).toMatchObject({ type: "STRING", value: "To Do", pos: 9 });
  });

  it("prefers the longest operator match (>= not > then =)", () => {
    const tokens = tokenize('updated >= "2026-01-01"');
    expect(tokens.map((t) => t.type)).toEqual(["IDENT", "OP", "STRING", "EOF"]);
    expect(tokens[1]).toMatchObject({ value: ">=" });
  });

  it("prefers !~ over ! then ~", () => {
    const tokens = tokenize('summary !~ "foo"');
    expect(tokens[1]).toMatchObject({ type: "OP", value: "!~" });
  });

  it("recognizes keywords case-insensitively", () => {
    const tokens = tokenize('status = "x" and priority != "y" order by updated desc');
    expect(tokens.map((t) => t.type)).toEqual([
      "IDENT", "OP", "STRING", "AND", "IDENT", "OP", "STRING", "ORDER", "BY", "IDENT", "DESC", "EOF",
    ]);
  });

  it("tokenizes IN (...) with commas and parens", () => {
    const tokens = tokenize('status IN ("To Do","In Progress")');
    expect(tokens.map((t) => t.type)).toEqual([
      "IDENT", "IN", "LPAREN", "STRING", "COMMA", "STRING", "RPAREN", "EOF",
    ]);
  });

  it("tokenizes IS EMPTY / IS NOT NULL", () => {
    const tokens = tokenize("assignee IS EMPTY");
    expect(tokens.map((t) => t.type)).toEqual(["IDENT", "IS", "EMPTY", "EOF"]);
    const tokens2 = tokenize("assignee IS NOT NULL");
    expect(tokens2.map((t) => t.type)).toEqual(["IDENT", "IS", "NOT", "NULL", "EOF"]);
  });

  it("tokenizes cf[123] as CF LBRACKET NUMBER RBRACKET", () => {
    const tokens = tokenize('cf[123] = "x"');
    expect(tokens.map((t) => t.type)).toEqual(["CF", "LBRACKET", "NUMBER", "RBRACKET", "OP", "STRING", "EOF"]);
  });

  it("tokenizes a function call currentUser()", () => {
    const tokens = tokenize("assignee = currentUser()");
    expect(tokens.map((t) => t.type)).toEqual(["IDENT", "OP", "IDENT", "LPAREN", "RPAREN", "EOF"]);
  });

  it("tokenizes a numeric literal", () => {
    const tokens = tokenize("storyPoints = 5");
    expect(tokens[2]).toMatchObject({ type: "NUMBER", value: "5" });
  });

  it("unescapes a backslash-escaped quote inside a string", () => {
    const tokens = tokenize('text ~ "say \\"hi\\""');
    expect(tokens[2]).toMatchObject({ type: "STRING", value: 'say "hi"' });
  });

  it("throws TqlParseError with the position of an unterminated string", () => {
    expect(() => tokenize('status = "unterminated')).toThrow(TqlParseError);
    try {
      tokenize('status = "unterminated');
    } catch (e) {
      expect(e).toBeInstanceOf(TqlParseError);
      expect((e as TqlParseError).position.pos).toBe(9);
    }
  });

  it("throws TqlParseError with the position of an unexpected character", () => {
    try {
      tokenize("status = @bad");
      throw new Error("expected tokenize to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TqlParseError);
      expect((e as TqlParseError).position.pos).toBe(9);
    }
  });

  it("computes line/col across multiple lines", () => {
    const tokens = tokenize('status = "a"\nAND priority = "b"');
    const andTok = tokens.find((t) => t.type === "AND")!;
    expect(andTok.line).toBe(2);
    expect(andTok.col).toBe(1);
  });
});
