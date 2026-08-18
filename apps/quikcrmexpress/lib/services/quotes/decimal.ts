/**
 * Decimal → number coercion for API responses.
 *
 * Prisma returns money columns as the runtime `Decimal` type (proxied from
 * the Postgres NUMERIC). Sending it directly through `JSON.stringify` works
 * (it stringifies to a number-shaped string) but `typeof === "string"`
 * trips up the front-end. So every list/detail handler runs values through
 * `toNumber()` before serialising.
 */

export function toNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  // Prisma Decimal instances have a `.toString()` that returns the canonical
  // decimal form; works for Big numbers too.
  const s = (v as { toString?: () => string }).toString?.() ?? String(v);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function toNullableNumber(v: unknown): number | null {
  if (v == null) return null;
  return toNumber(v);
}
