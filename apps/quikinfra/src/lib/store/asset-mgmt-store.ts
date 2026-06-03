/**
 * Asset Management — lightweight in-memory store backing the Store →
 * Asset Management module. Persists across HMR via globalThis but does
 * NOT survive a process restart; matches the simplicity bar of the
 * diesel-log route. Three collections:
 *
 *   - assets        Lifecycle records (Asset Register tab)
 *   - categories    Asset Categories tab
 *   - issuances     Asset Issuance & Returns tab
 *
 * IDs are local to this module so they don't collide with the existing
 * `cn_assets` Prisma master.
 */

const g = globalThis as any;

if (!g.__qcAssetMgmt) {
  g.__qcAssetMgmt = {
    assets: [] as any[],
    categories: [] as any[],
    issuances: [] as any[],
    nextSeq: 1,
  };
}

const m = g.__qcAssetMgmt as {
  assets: any[];
  categories: any[];
  issuances: any[];
  nextSeq: number;
};

export function getAssets(): any[] { return m.assets; }
export function getCategories(): any[] { return m.categories; }
export function getIssuances(): any[] { return m.issuances; }

export function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${m.nextSeq++}`;
}
