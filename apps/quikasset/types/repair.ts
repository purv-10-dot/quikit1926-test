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
  /** Legacy free-text vendor (old repairs); superseded by vendorId/vendorRef. */
  vendor?: string | null;
  vendorId?: string | null;
  vendorRef?: { id: string; name: string } | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  sentDate?: string | null;
  expectedReturn?: string | null;
  returnedDate?: string | null;
  notes?: string | null;
  status: RepairStatus;
  asset?: Asset | null;
  /** Platform User.id of who logged/sent the repair; `sentByName` is resolved. */
  createdByUserId?: string | null;
  sentByName?: string | null;
};
