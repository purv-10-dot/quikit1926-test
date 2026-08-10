/**
 * Translate a comma-separated filter query param into a Prisma scalar filter.
 *
 * The list filters (owner / who / status) are multi-select in the UI and travel
 * over the wire as `?owner=u1,u2,u3`. Shared here so every module's scope
 * helper translates them identically.
 *
 * Mapping:
 *   undefined / ""  → `undefined`  (filter not applied)
 *   "u1"            → `"u1"`       (scalar equality — keeps single-select
 *                                   behaviour and its index usage unchanged)
 *   "u1,u2"         → `{ in: [...] }`
 *   ",, "           → `NO_MATCH`   (an explicit but empty selection matches
 *                                   nothing, rather than silently matching all)
 */

/** Sentinel value that can never be a real id/status, so it matches no rows. */
export const NO_MATCH = "__none__";

export type MultiFilter = string | { in: string[] } | undefined;

export function parseMultiFilter(raw: string | undefined | null): MultiFilter {
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return NO_MATCH;
  if (parts.length === 1) return parts[0];
  return { in: parts };
}

/**
 * Same parse, but for a column matched with `has` semantics (a scalar-list
 * column such as `KPI.ownerIds`). Returns a Prisma list filter.
 */
export function parseMultiListFilter(
  raw: string | undefined | null,
): { has: string } | { hasSome: string[] } | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { has: NO_MATCH };
  if (parts.length === 1) return { has: parts[0]! };
  return { hasSome: parts };
}
