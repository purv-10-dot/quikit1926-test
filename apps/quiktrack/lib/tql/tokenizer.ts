/**
 * TQL (admin Filters search) tokenizer.
 *
 * A separate, independent lexer from lib/services/qql (QUIKTR-117's MCP
 * search_issues engine) — that engine is scoped to a single project and is
 * intentionally left untouched. This one targets the org-wide admin Filters
 * "TQL" mode and its own grammar subset (EMPTY/NULL, function calls,
 * cf[<id>] bracket refs) that QQL doesn't need.
 *
 * Every token carries its source offset (and derived line/col) so the parser
 * and translator can report a precise error position — never a silent wrong
 * result or an opaque 500.
 */

export type TokenType =
  | "IDENT"
  | "STRING"
  | "NUMBER"
  | "CF"
  | "LBRACKET"
  | "RBRACKET"
  | "AND"
  | "OR"
  | "NOT"
  | "IN"
  | "IS"
  | "EMPTY"
  | "NULL"
  | "ORDER"
  | "BY"
  | "ASC"
  | "DESC"
  | "OP"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
  line: number;
  col: number;
}

export interface TqlPosition {
  pos: number;
  line: number;
  col: number;
}

export class TqlParseError extends Error {
  constructor(
    message: string,
    public readonly position: TqlPosition,
  ) {
    super(message);
    this.name = "TqlParseError";
  }
}

const KEYWORDS: Record<string, TokenType> = {
  AND: "AND",
  OR: "OR",
  NOT: "NOT",
  IN: "IN",
  IS: "IS",
  EMPTY: "EMPTY",
  NULL: "NULL",
  ORDER: "ORDER",
  BY: "BY",
  ASC: "ASC",
  DESC: "DESC",
};

// Longest-match-first so ">=" isn't split into ">" then "=", and "!~" isn't
// split into an unrecognized "!" then "~".
const OPERATORS = ["!=", ">=", "<=", "!~", "=", ">", "<", "~"] as const;

// One unquoted word: optional leading "-" (relative date function args like
// "-7d" are passed as string literals, not bare words, but this stays
// permissive for bare identifiers with dashes, e.g. epic keys "PRJ-1").
const WORD_RE = /^[A-Za-z_][\w.]*/;
const NUMBER_RE = /^-?\d+(\.\d+)?/;

function lineColAt(input: string, pos: number): { line: number; col: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < pos; i++) {
    if (input[i] === "\n") {
      line++;
      lastNewline = i;
    }
  }
  return { line, col: pos - lastNewline };
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const n = input.length;
  let i = 0;

  const push = (type: TokenType, value: string, start: number) => {
    const { line, col } = lineColAt(input, start);
    tokens.push({ type, value, pos: start, line, col });
  };
  const fail = (message: string, at: number): never => {
    throw new TqlParseError(message, { pos: at, ...lineColAt(input, at) });
  };

  while (i < n) {
    const ch = input[i]!;

    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      push("LPAREN", "(", i);
      i++;
      continue;
    }
    if (ch === ")") {
      push("RPAREN", ")", i);
      i++;
      continue;
    }
    if (ch === "[") {
      push("LBRACKET", "[", i);
      i++;
      continue;
    }
    if (ch === "]") {
      push("RBRACKET", "]", i);
      i++;
      continue;
    }
    if (ch === ",") {
      push("COMMA", ",", i);
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const start = i;
      const quote = ch;
      i++;
      let value = "";
      while (i < n && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < n) {
          value += input[i + 1];
          i += 2;
          continue;
        }
        value += input[i];
        i++;
      }
      if (i >= n) {
        fail("Unterminated string literal", start);
      }
      i++; // closing quote
      push("STRING", value, start);
      continue;
    }

    const opMatch = OPERATORS.find((op) => input.startsWith(op, i));
    if (opMatch) {
      push("OP", opMatch, i);
      i += opMatch.length;
      continue;
    }

    const numMatch = NUMBER_RE.exec(input.slice(i));
    if (numMatch && /\d/.test(input[i + (numMatch[0].startsWith("-") ? 1 : 0)] ?? "")) {
      const start = i;
      push("NUMBER", numMatch[0], start);
      i += numMatch[0].length;
      continue;
    }

    const wordMatch = WORD_RE.exec(input.slice(i));
    if (wordMatch) {
      const start = i;
      const word = wordMatch[0];
      i += word.length;
      const upper = word.toUpperCase();
      if (upper === "CF") {
        push("CF", word, start);
        continue;
      }
      const keyword = KEYWORDS[upper];
      push(keyword ?? "IDENT", keyword ? upper : word, start);
      continue;
    }

    fail(`Unexpected character "${ch}"`, i);
  }

  push("EOF", "", n);
  return tokens;
}
