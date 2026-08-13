/**
 * Decimal-precision rule for Critical Number entry.
 *
 * Two decimal places is the product rule for both the Target Value and each
 * recorded reading. It is enforced in two INDEPENDENT places, which is why the
 * logic lives here instead of in either one:
 *   - the inputs, which refuse a 3rd decimal digit as it is typed
 *   - the Zod schemas, so the API holds the line for any non-UI caller
 */

/** Target Value and recorded readings allow at most this many decimals. */
export const MAX_VALUE_DECIMALS = 2;

/**
 * How many decimal places a number actually carries.
 *
 * Reads `String(n)` — the shortest exact representation — rather than doing
 * arithmetic, and handles the exponential form JS switches to at the magnitude
 * extremes: `String(1e-7)` is `"1e-7"`, which is 7 decimals, not 0. Getting
 * that wrong would let `1e-7` through as "no decimals".
 */
export function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const m = /^-?\d+(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(n));
  if (!m) return 0;
  const fraction = m[1]?.length ?? 0;
  const exponent = m[2] ? Number(m[2]) : 0;
  return Math.max(0, fraction - exponent);
}

/** The schema-side predicate: does this number respect the rule? */
export function hasMaxDecimalPlaces(n: number, max: number = MAX_VALUE_DECIMALS): boolean {
  return decimalPlaces(n) <= max;
}

/**
 * Sanitise a numeric TEXT input, truncating the fraction to `max` digits.
 *
 * Mirrors `sanitizeNumericInput` in OPSP's category.tsx (digits, single dot)
 * with two deliberate differences:
 *   - a leading "-" survives: a negative target is legal here and the schema
 *     accepts one, so stripping it would be a silent behaviour change
 *   - the fraction is TRUNCATED, not rounded, so a 3rd digit simply never
 *     appears rather than quietly altering the 2nd
 *
 * A trailing "." is preserved so "10." is a typable intermediate state on the
 * way to "10.5" instead of being eaten as the user types.
 */
export function clampDecimalInput(raw: string, max: number = MAX_VALUE_DECIMALS): string {
  const text = raw ?? "";
  const negative = text.trimStart().startsWith("-");
  let s = text.replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot >= 0) {
    const whole = s.slice(0, firstDot);
    // Collapse any later dots, then cut the fraction to length.
    const fraction = s.slice(firstDot + 1).replace(/\./g, "").slice(0, max);
    s = max === 0 ? whole : `${whole}.${fraction}`;
  }
  return negative ? `-${s}` : s;
}

/**
 * Round away the binary-float noise that scale multiplication introduces.
 *
 * Entering "0.07" with "Lakh" selected multiplies out to 7000.000000000001 —
 * 12 decimal places — which `hasMaxDecimalPlaces` would refuse even though the
 * user typed two. Real cases: 0.29 × 100000 = 28999.999999999996 and
 * 2.03 × 10000000 = 20299999.999999996.
 *
 * Safe because multiplying by a scale (always ≥ 1) can only ever REDUCE the
 * decimal count, so for genuine ≤2-decimal input the rounding is lossless and
 * only removes the representation error.
 */
export function roundToDecimals(n: number, max: number = MAX_VALUE_DECIMALS): number {
  if (!Number.isFinite(n)) return n;
  const factor = 10 ** max;
  return Math.round(n * factor) / factor;
}
