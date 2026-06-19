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

export interface AssetRecord {
  id: string;
  assetCode: string;
  name: string;
  categoryId: string;
  model?: string | null;
  purchaseDate?: string | null;
  cost?: number | null;
  status: string;
  requiresApproval?: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface AssetCategory {
  id: string;
  name: string;
  parentId?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface AssetIssuance {
  id: string;
  issuanceNumber: string;
  assetId: string;
  issuedTo?: string | null;
  issueDate?: string | null;
  expectedReturn?: string | null;
  returnable?: boolean;
  notes?: string | null;
  status: string;
  returnedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AssetMgmtStore {
  assets: AssetRecord[];
  categories: AssetCategory[];
  issuances: AssetIssuance[];
  nextSeq: number;
}

const g = globalThis as unknown as { __qcAssetMgmt?: AssetMgmtStore };

if (!g.__qcAssetMgmt) {
  g.__qcAssetMgmt = {
    assets: [],
    categories: [],
    issuances: [],
    nextSeq: 1,
  };
}

const m = g.__qcAssetMgmt;

export function getAssets(): AssetRecord[] { return m.assets; }
export function getCategories(): AssetCategory[] { return m.categories; }
export function getIssuances(): AssetIssuance[] { return m.issuances; }

export function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${m.nextSeq++}`;
}
