/**
 * Hand-written DTO for the Asset Request feature (Module 1).
 *
 * This mirrors the *planned* `AstAssetRequest` Prisma model but is deliberately
 * NOT generated from it — it lets the admin UI + mocks compile before the schema
 * sign-off lands. Once the model is generated, reconcile this with the Prisma
 * types (keep the string-literal unions in step with the enums).
 */

export type AssetRequestKind = "Physical" | "Subscription";

/**
 * Display labels for the item kind. The DB enum values stay "Physical" /
 * "Subscription" — this is presentation only. Use everywhere the kind is shown
 * to a user (request form, approval queue, fulfil dialog).
 */
export const ASSET_REQUEST_KIND_LABELS: Record<AssetRequestKind, string> = {
  Physical: "Physical Assets",
  Subscription: "Digital Assets",
};

export type AssetRequestType = "New" | "Replacement" | "Upgrade" | "Additional";

export type AssetRequestPriority = "Low" | "Medium" | "High" | "Urgent";

export type AssetRequestStatus =
  | "Draft"
  | "Submitted"
  | "PendingApproval"
  | "Approved"
  | "Rejected"
  | "PartiallyFulfilled"
  | "Fulfilled"
  | "Cancelled";

export type AssetRequest = {
  id: string;
  requesterUserId: string;
  /** Resolved for display via the AstEmployee.userId identity bridge. */
  requesterName?: string | null;
  requesterEmployeeId?: string | null;
  itemKind: AssetRequestKind;
  /** Requested item type — a Category Master name (free text for now). */
  itemType: string;
  categoryId?: string | null;
  baseCategoryId?: string | null;
  requestType: AssetRequestType;
  quantity: number;
  quantityFulfilled: number;
  justification: string;
  priority: AssetRequestPriority;
  requiredBy?: string | null;
  status: AssetRequestStatus;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  decisionNote?: string | null;
  /** Subscription/external fulfilment reference (Option A). */
  fulfilmentNote?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Decision an approver can take on a request. */
export type AssetRequestDecision = "approve" | "reject";
