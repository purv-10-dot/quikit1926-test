/**
 * QQL (QuikTrack Query Language) tokenizer — QUIKTR-117.
 * Small hand-rolled lexer, same "regex-scan, no exceptions on ambiguity"
 * spirit as parseDurationToHours (lib/utils/timesheetPeriod.ts), but every
 * token carries its source offset so the parser can report a precise error
 * position (never a silent wrong-result or a 500).
 */

export type TokenType =
  | "IDENT"
  | "STRING"
  | "AND"
  | "OR"
  | "IN"
  | "NOT"
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
}

export class QqlParseError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(message);
    this.name = "QqlParseError";
  }
}

const KEYWORDS: Record<string, TokenType> = {
  AND: "AND",
  OR: "OR",
  IN: "IN",
  NOT: "NOT",
  ORDER: "ORDER",
  BY: "BY",
  ASC: "ASC",
  DESC: "DESC",
};

// Longest-match-first so ">=" isn't split into ">" then "=".
const OPERATORS = ["!=", ">=", "<=", "=", ">", "<", "~"] as const;

// One unquoted word: optional leading "-" (relative dates like "-7d"),
// then at least one alnum/underscore, then any run of word chars plus
// ":"/"."/"-" (covers "acct:123", ISO dates "2026-01-01", epic keys "PRJ-1").
const WORD_RE = /^-?[A-Za-z0-9_][\w:.-]*/;

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const n = input.length;
  let i = 0;

  while (i < n) {
    const ch = input[i]!;

    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(", pos: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")", pos: i });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "COMMA", value: ",", pos: i });
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
        throw new QqlParseError("Unterminated string literal", start);
      }
      i++; // closing quote
      tokens.push({ type: "STRING", value, pos: start });
      continue;
    }

    const opMatch = OPERATORS.find((op) => input.startsWith(op, i));
    if (opMatch) {
      tokens.push({ type: "OP", value: opMatch, pos: i });
      i += opMatch.length;
      continue;
    }

    const wordMatch = WORD_RE.exec(input.slice(i));
    if (wordMatch) {
      const start = i;
      const word = wordMatch[0];
      i += word.length;
      const upper = word.toUpperCase();
      const keyword = KEYWORDS[upper];
      tokens.push(keyword ? { type: keyword, value: upper, pos: start } : { type: "IDENT", value: word, pos: start });
      continue;
    }

    throw new QqlParseError(`Unexpected character "${ch}"`, i);
  }

  tokens.push({ type: "EOF", value: "", pos: n });
  return tokens;
}
