import type { Asset } from "./asset";
import type { User } from "./user";
import type { Repair } from "./repair";

export type ReplacementType = "Temporary" | "Permanent";

export type Replacement = {
  id: string;
  repairId: string;
  assetId: string;
  userId: string;
  type: ReplacementType;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  isActive: boolean;
  asset?: Asset | null;
  user?: User | null;
  repair?: Repair | null;
};
