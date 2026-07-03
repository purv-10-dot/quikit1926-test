import type { Asset } from "./asset";

export type RepairStatus =
  | "Pending"
  | "InRepair"
  | "Repaired"
  | "Recovered"
  | "Unrepairable";

export type Repair = {
  id: string;
  assetId: string;
  issueTitle: string;
  issueDescription: string;
  vendor?: string | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  sentDate?: string | null;
  expectedReturn?: string | null;
  returnedDate?: string | null;
  notes?: string | null;
  status: RepairStatus;
  asset?: Asset | null;
};
