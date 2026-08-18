import { describe, it, expect } from "vitest";
import { tokenize, QqlParseError } from "@/lib/services/qql/tokenizer";

describe("tokenize", () => {
  it("tokenizes a simple comparison", () => {
    const tokens = tokenize('status = "To Do"');
    expect(tokens.map((t) => t.type)).toEqual(["IDENT", "OP", "STRING", "EOF"]);
    expect(tokens[0]).toMatchObject({ type: "IDENT", value: "status", pos: 0 });
    expect(tokens[1]).toMatchObject({ type: "OP", value: "=", pos: 7 });
    expect(tokens[2]).toMatchObject({ type: "STRING", value: "To Do", pos: 9 });
  });

  it("prefers the longest operator match (>= not > then =)", () => {
    const tokens = tokenize("updated >= -7d");
    expect(tokens.map((t) => [t.type, t.value])).toEqual([
      ["IDENT", "updated"],
      ["OP", ">="],
      ["IDENT", "-7d"],
      ["EOF", ""],
    ]);
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

  it("unescapes a backslash-escaped quote inside a string", () => {
    const tokens = tokenize('text ~ "say \\"hi\\""');
    expect(tokens[2]).toMatchObject({ type: "STRING", value: 'say "hi"' });
  });

  it("throws QqlParseError with the position of an unterminated string", () => {
    expect(() => tokenize('status = "unterminated')).toThrow(QqlParseError);
    try {
      tokenize('status = "unterminated');
    } catch (e) {
      expect(e).toBeInstanceOf(QqlParseError);
      expect((e as QqlParseError).position).toBe(9);
    }
  });

  it("throws QqlParseError with the position of an unexpected character", () => {
    try {
      tokenize("status = @bad");
      throw new Error("expected tokenize to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(QqlParseError);
      expect((e as QqlParseError).position).toBe(9);
    }
  });
});
