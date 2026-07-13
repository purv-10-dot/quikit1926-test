/** Client-safe fixed asset types — no server/db imports. */

export interface FixedAssetDashboardKpis {
  assets: number;
  available: number;
  issued: number;
  underRepair: number;
  lost: number;
  bookValue: number;
}

export interface FixedAssetCategoryRow {
  [key: string]: unknown;
  category: string;
  assets: number;
  bookValue: number;
}

export interface FixedAssetDashboardPayload {
  kpis: FixedAssetDashboardKpis;
  byCategory: FixedAssetCategoryRow[];
}

export interface FixedAssetIssuanceRecord {
  [key: string]: unknown;
  id: string;
  orgId: string;
  issuanceNumber: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  issuedToType: string;
  issuedTo: string;
  projectId: string | null;
  projectName: string | null;
  quantity: number;
  pendingQty: number;
  gatePassNo: string | null;
  expectedReturnDate: string | null;
  returnable: boolean;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface FixedAssetTransferRecord {
  [key: string]: unknown;
  id: string;
  orgId: string;
  transferNumber: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  quantity: number;
  sourceProjectId: string | null;
  sourceProjectName: string | null;
  destinationProjectId: string;
  destinationProjectName: string;
  destinationLocation: string | null;
  transferDate: string;
  gatePassNo: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface FixedAssetRepairRecord {
  id: string;
  orgId: string;
  repairNumber: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  quantity: number;
  problem: string | null;
  repairCost: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface FixedAssetAuditRecord {
  id: string;
  orgId: string;
  auditNumber: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  bookQty: number;
  countedQty: number;
  varianceQty: number;
  auditDate: string;
  remarks: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface FixedAssetDepreciationRow {
  id: string;
  assetCode: string;
  assetName: string;
  deprMethod: string | null;
  deprRate: number | null;
  cost: number;
  accumulatedDepr: number;
  annualDepr: number;
  bookValue: number;
}

export interface FixedAssetQtyState {
  total: number;
  issued: number;
  underRepair: number;
  inTransit: number;
  lost: number;
  available: number;
}
