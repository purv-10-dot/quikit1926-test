/**
 * Pure helpers (no DB / no env access). Kept in their own file so unit tests
 * can import them without instantiating a Prisma client.
 */

const ROUND_FACTOR = 100;

export function computeWeightedAmount(
  amount: number | string | { toString(): string } | null | undefined,
  probability: number,
): number | null {
  if (amount == null) return null;
  const n = typeof amount === "number" ? amount : Number(String(amount));
  if (!Number.isFinite(n)) return null;
  const w = (n * (probability ?? 0)) / 100;
  return Math.round(w * ROUND_FACTOR) / ROUND_FACTOR;
}

export function computeProductLineTotal(
  quantity: number,
  unitPrice: number,
  discountPct: number,
): number {
  return Math.round(quantity * unitPrice * (1 - discountPct / 100) * 100) / 100;
}
