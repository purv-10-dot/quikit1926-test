/**
 * TQL translator-level errors. Tokenizer/parser syntax errors are
 * `TqlParseError` (see tokenizer.ts); these two cover queries that are
 * syntactically valid but reference a field or operator the translator
 * can't back with real data, so the caller gets a clear message instead of
 * a generic 500 or, worse, a silently-wrong result.
 */
import { TqlParseError, type TqlPosition } from "./tokenizer";

export { TqlParseError };
export type { TqlPosition };

export class TqlUnsupportedFieldError extends TqlParseError {
  constructor(field: string, reason: string, position: TqlPosition) {
    super(`"${field}" isn't supported in QuikTrack TQL — ${reason}`, position);
    this.name = "TqlUnsupportedFieldError";
  }
}

export class TqlUnsupportedOperatorError extends TqlParseError {
  constructor(field: string, op: string, allowed: string[], position: TqlPosition) {
    super(`"${field}" doesn't support "${op}" — use ${allowed.join(", ")}`, position);
    this.name = "TqlUnsupportedOperatorError";
  }
}
