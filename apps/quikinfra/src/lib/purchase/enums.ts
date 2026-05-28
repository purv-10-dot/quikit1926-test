/**
 * Purchase Module — Canonical Status Enums
 *
 * Single source of truth for all workflow statuses across:
 * - Prisma schema
 * - API validation
 * - Service layer transitions
 * - UI badges / filters / forms
 * - Dashboard queries
 * - Reports
 */

// ─── MR (Material Requisition) ──────────────────────────────────────

export enum MRStatus {
  DRAFT = "draft",
  SUBMITTED = "submitted",
  PARTIALLY_APPROVED = "partially_approved",
  APPROVED_FOR_STOCK_ISSUE = "approved_stock_available",
  APPROVED_FOR_INDENT = "approved_indent_required",
  PARTIALLY_SERVED = "partially_served",
  FULLY_SERVED = "fully_served",
  REJECTED = "rejected",
}

export enum MRLineStatus {
  DRAFT = "draft",
  SUBMITTED = "submitted",
  APPROVED_FOR_ISSUE = "approved_for_issue",
  APPROVED_FOR_INDENT = "approved_for_indent",
  REJECTED = "rejected",
  ISSUED_FROM_STOCK = "issued_from_stock",
  IN_INDENT_PROCESS = "in_indent_process",
  FULLY_SERVED = "fully_served",
}

// ─── Indent ─────────────────────────────────────────────────────────

export enum IndentStatus {
  DRAFT = "draft",
  SUBMITTED_L1 = "submitted_l1",
  APPROVED_L2 = "approved_l2",
  APPROVED_L3 = "l3_approved",
  PARTIALLY_PO_CREATED = "partially_po_created",
  FULLY_PO_CREATED = "fully_po_created",
  CLOSED = "closed",
  REJECTED_L2 = "rejected_l2",
  REJECTED_L3 = "rejected_l3",
  CANCELLED = "cancelled",
}

export enum IndentLineStatus {
  OPEN = "open",
  PARTIALLY_PO_CREATED = "partially_po",
  FULLY_PO_CREATED = "fully_po",
  PARTIALLY_RECEIVED = "partially_received",
  FULLY_RECEIVED = "fully_received",
  CLOSED = "closed",
  REJECTED = "rejected",
}

// ─── Purchase Order ─────────────────────────────────────────────────

export enum POStatus {
  DRAFT = "draft",
  PENDING_L1 = "pending_l1",
  PENDING_L2 = "pending_l2",
  APPROVED = "approved",
  DISPATCHED = "dispatched",
  PARTIALLY_RECEIVED = "partially_received",
  FULLY_RECEIVED = "fully_received",
  UNDER_AMENDMENT = "under_amendment",
  CLOSED = "closed",
  CANCELLED = "cancelled",
  REJECTED = "rejected",
}

export enum POLineStatus {
  OPEN = "open",
  PARTIALLY_RECEIVED = "partially_received",
  FULLY_RECEIVED = "fully_received",
  CANCELLED = "cancelled",
}

// ─── GRN ────────────────────────────────────────────────────────────

export enum GRNStatus {
  DRAFT = "draft",
  PENDING_APPROVAL = "pending_approval",
  APPROVED = "approved",
  REJECTED = "rejected",
  ACCOUNTS_EXPORTED = "accounts_exported",
}

// ─── Stock Check ────────────────────────────────────────────────────

export enum StockCheckStatus {
  AVAILABLE = "AVAILABLE",
  PARTIAL = "PARTIAL",
  INSUFFICIENT = "INSUFFICIENT",
}

// ─── Vendor Enquiry (Phase 2 scaffold) ──────────────────────────────

export enum EnquiryStatus {
  DRAFT = "draft",
  SENT = "sent",
  RESPONSES_RECEIVED = "responses_received",
  COMPARISON_DONE = "comparison_done",
  CLOSED = "closed",
}

// ─── Quotation (Phase 2 scaffold) ───────────────────────────────────

export enum QuotationRank {
  L1 = "L1",
  L2 = "L2",
  L3 = "L3",
  UNRANKED = "unranked",
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Check if an indent is in a final-approved state eligible for PO creation */
export function isIndentApprovedForPO(status: string): boolean {
  return [IndentStatus.APPROVED_L3, "approved", "l3_approved", "l3approved"].includes(status);
}

/** Check if PO is eligible for GRN */
export function isPOEligibleForGRN(status: string): boolean {
  return [POStatus.APPROVED, POStatus.DISPATCHED, POStatus.PARTIALLY_RECEIVED].includes(status as POStatus);
}

/** Allowed MR status transitions */
export const MR_TRANSITIONS: Record<string, string[]> = {
  [MRStatus.DRAFT]: [MRStatus.SUBMITTED],
  [MRStatus.SUBMITTED]: [MRStatus.APPROVED_FOR_STOCK_ISSUE, MRStatus.APPROVED_FOR_INDENT, MRStatus.PARTIALLY_APPROVED, MRStatus.REJECTED],
  [MRStatus.APPROVED_FOR_STOCK_ISSUE]: [MRStatus.PARTIALLY_SERVED, MRStatus.FULLY_SERVED],
  [MRStatus.APPROVED_FOR_INDENT]: [MRStatus.PARTIALLY_SERVED, MRStatus.FULLY_SERVED],
  [MRStatus.PARTIALLY_APPROVED]: [MRStatus.PARTIALLY_SERVED, MRStatus.FULLY_SERVED],
  [MRStatus.REJECTED]: [MRStatus.DRAFT],
};

/** Allowed Indent status transitions */
export const INDENT_TRANSITIONS: Record<string, string[]> = {
  [IndentStatus.DRAFT]: [IndentStatus.SUBMITTED_L1],
  [IndentStatus.SUBMITTED_L1]: [IndentStatus.APPROVED_L2, IndentStatus.REJECTED_L2],
  [IndentStatus.APPROVED_L2]: [IndentStatus.APPROVED_L3, IndentStatus.REJECTED_L3],
  [IndentStatus.APPROVED_L3]: [IndentStatus.PARTIALLY_PO_CREATED, IndentStatus.FULLY_PO_CREATED, IndentStatus.CLOSED],
  [IndentStatus.PARTIALLY_PO_CREATED]: [IndentStatus.FULLY_PO_CREATED, IndentStatus.CLOSED],
  [IndentStatus.REJECTED_L2]: [IndentStatus.DRAFT],
  [IndentStatus.REJECTED_L3]: [IndentStatus.DRAFT],
};

/** Allowed PO status transitions */
export const PO_TRANSITIONS: Record<string, string[]> = {
  [POStatus.DRAFT]: [POStatus.PENDING_L1],
  [POStatus.PENDING_L1]: [POStatus.APPROVED, POStatus.PENDING_L2, POStatus.REJECTED],
  [POStatus.PENDING_L2]: [POStatus.APPROVED, POStatus.REJECTED],
  [POStatus.APPROVED]: [POStatus.DISPATCHED, POStatus.PARTIALLY_RECEIVED, POStatus.UNDER_AMENDMENT, POStatus.CLOSED],
  [POStatus.DISPATCHED]: [POStatus.PARTIALLY_RECEIVED, POStatus.FULLY_RECEIVED, POStatus.UNDER_AMENDMENT],
  [POStatus.PARTIALLY_RECEIVED]: [POStatus.FULLY_RECEIVED, POStatus.UNDER_AMENDMENT, POStatus.CLOSED],
  [POStatus.FULLY_RECEIVED]: [POStatus.CLOSED],
  [POStatus.UNDER_AMENDMENT]: [POStatus.APPROVED],
  [POStatus.REJECTED]: [POStatus.DRAFT],
};

/** UI badge colors for statuses */
export const STATUS_BADGE_COLORS: Record<string, string> = {
  // MR
  [MRStatus.DRAFT]: "bg-gray-100 text-gray-600",
  [MRStatus.SUBMITTED]: "bg-orange-100 text-orange-700",
  [MRStatus.APPROVED_FOR_STOCK_ISSUE]: "bg-green-100 text-green-700",
  [MRStatus.APPROVED_FOR_INDENT]: "bg-amber-100 text-amber-700",
  [MRStatus.REJECTED]: "bg-red-100 text-red-700",
  [MRStatus.FULLY_SERVED]: "bg-emerald-100 text-emerald-700",
  // Indent
  [IndentStatus.SUBMITTED_L1]: "bg-orange-100 text-orange-700",
  [IndentStatus.APPROVED_L2]: "bg-indigo-100 text-indigo-700",
  [IndentStatus.APPROVED_L3]: "bg-green-100 text-green-700",
  [IndentStatus.REJECTED_L2]: "bg-red-100 text-red-700",
  [IndentStatus.REJECTED_L3]: "bg-red-100 text-red-700",
  // PO
  [POStatus.APPROVED]: "bg-green-100 text-green-700",
  [POStatus.DISPATCHED]: "bg-cyan-100 text-cyan-700",
  [POStatus.PARTIALLY_RECEIVED]: "bg-amber-100 text-amber-700",
  [POStatus.FULLY_RECEIVED]: "bg-emerald-100 text-emerald-700",
  [POStatus.UNDER_AMENDMENT]: "bg-purple-100 text-purple-700",
  // GRN (GRNStatus.APPROVED shares literal "approved" with POStatus.APPROVED — covered above)
  [GRNStatus.PENDING_APPROVAL]: "bg-yellow-100 text-yellow-700",
  [GRNStatus.ACCOUNTS_EXPORTED]: "bg-teal-100 text-teal-700",
};
