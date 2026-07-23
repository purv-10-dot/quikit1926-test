import type { Asset } from "./asset";
import type { User } from "./user";

export type AssignmentStatus = "Active" | "Returned";

export type Assignment = {
  id: string;
  assetId: string;
  userId: string;
  condition: string;
  expectedReturn?: string | null;
  notes?: string | null;
  status: AssignmentStatus;
  assignedAt?: string | null;
  returnedAt?: string | null;
  asset?: Asset | null;
  user?: User | null;
  /** Platform User.id of who performed the assignment; `assignedByName` resolved. */
  assignedByUserId?: string | null;
  assignedByName?: string | null;
};
