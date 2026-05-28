/**
 * Indian-format aware number parser for the Universal Import adapter.
 *
 * Handles every weird numeric variant we've seen in real BOQs:
 *   - "9,26,500"     → 926500        Indian lakh grouping
 *   - "1,23,456.78"  → 123456.78
 *   - "₹1,500.50"    → 1500.5        currency prefix
 *   - "(500)"        → -500          accountants' negative
 *   - "-" / "nil"    → 0             nil placeholder
 *   - "2.5L"         → 250000        lakhs suffix
 *   - "3Cr"          → 30000000      crore suffix
 *   - "I.R." / "N/A" → NaN           non-numeric markers
 *
 * Returns `NaN` for anything that can't be parsed as a number so the caller
 * can distinguish "missing" from 0.
 *
 * Spec reference: AAKAR ERP BOQ Universal Import Engine Spec v1.0 §4.1.
 */

const NIL_TOKENS = /^(-+|–+|nil|na|n\/a|ir|i\.r\.?|ir\.)$/i;
const LAKH_SUFFIX = /^([+-]?[\d.,]+)\s*l$/i;
const CRORE_SUFFIX = /^([+-]?[\d.,]+)\s*cr$/i;

/** Parse a single numeric cell. Returns NaN on failure (use isNaN to check). */
export function parseIndianNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number") return value;

  let s = String(value).trim();
  if (!s) return NaN;

  // Nil / placeholder tokens → 0
  if (NIL_TOKENS.test(s)) return 0;

  // Lakh / crore suffix
  const lakh = s.match(LAKH_SUFFIX);
  if (lakh) {
    const base = parseIndianNumber(lakh[1]);
    return Number.isNaN(base) ? NaN : base * 100000;
  }
  const crore = s.match(CRORE_SUFFIX);
  if (crore) {
    const base = parseIndianNumber(crore[1]);
    return Number.isNaN(base) ? NaN : base * 10000000;
  }

  // Accountant parentheses = negative
  let negParen = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negParen = true;
    s = s.slice(1, -1);
  }

  // Strip currency + whitespace + commas (commas serve as thousand/lakh
  // separators in Indian formatting; removing them all is safe because the
  // decimal point is ".").
  s = s.replace(/[₹$€£\s,]/g, "");

  if (!s || s === "-" || s === ".") return NaN;

  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return NaN;
  return negParen ? -n : n;
}

/** Convenience: true when `parseIndianNumber` returns a finite number. */
export function isNumericCell(value: unknown): boolean {
  const n = parseIndianNumber(value);
  return Number.isFinite(n);
}
