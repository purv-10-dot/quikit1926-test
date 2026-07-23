/**
 * Pure helpers for bulk assignment (assign many assets to one person). No DB/fs
 * imports, so this is safe on both the client (pre-submit checks) and the server
 * (the /api/assignments/bulk route).
 */

/** Max assets assignable in one bulk submit. */
export const MAX_BULK_ASSIGN = 50;

/** First asset id that appears more than once, or null if all are unique. */
export function findDuplicateAssetId(ids: string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

export type AssignableAsset = {
  id: string;
  assetStatus: string;
  condition: string;
  itemName: string;
};

/**
 * Split the requested ids against the fetched asset rows into:
 *   - missing:     requested but not found (wrong org / deleted)
 *   - unavailable: found but not "Available" (already assigned / in repair / retired)
 *   - assignable:  found and Available
 * Callers reject the whole batch if missing or unavailable is non-empty
 * (all-or-nothing). Assumes `requestedIds` is already de-duplicated.
 */
export function partitionAssignable(
  requestedIds: string[],
  assets: AssignableAsset[],
): { missing: string[]; unavailable: AssignableAsset[]; assignable: AssignableAsset[] } {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const missing: string[] = [];
  const unavailable: AssignableAsset[] = [];
  const assignable: AssignableAsset[] = [];
  for (const id of requestedIds) {
    const a = byId.get(id);
    if (!a) {
      missing.push(id);
    } else if (a.assetStatus !== "Available") {
      unavailable.push(a);
    } else {
      assignable.push(a);
    }
  }
  return { missing, unavailable, assignable };
}
