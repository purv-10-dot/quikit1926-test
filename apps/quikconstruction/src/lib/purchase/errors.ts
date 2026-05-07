/**
 * Purchase Module — Standardized Error Types
 *
 * All purchase API errors return:
 * { error: string, code: string, details?: any }
 */

export class PurchaseError extends Error {
  code: string;
  httpStatus: number;
  details?: any;

  constructor(code: string, message: string, httpStatus = 400, details?: any) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.name = "PurchaseError";
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

// ─── Error Constructors ─────────────────────────────────────────────

export const Errors = {
  invalidWorkflowState: (current: string, expected: string[]) =>
    new PurchaseError("INVALID_WORKFLOW_STATE", `Current status "${current}" does not allow this action. Expected: ${expected.join(", ")}`, 409),

  approvalRequired: (level: string) =>
    new PurchaseError("APPROVAL_REQUIRED", `${level} approval is required before this action.`, 403),

  overReceiptNotAllowed: (item: string, accepted: number, pending: number) =>
    new PurchaseError("OVER_RECEIPT_NOT_ALLOWED", `Accepted qty (${accepted}) exceeds pending qty (${pending}) for ${item}. Reduce received or increase rejected qty.`),

  blacklistedVendor: (vendorName: string) =>
    new PurchaseError("BLACKLISTED_VENDOR", `Vendor "${vendorName}" is blacklisted and cannot be used for procurement.`),

  missingAttachment: (role: string) =>
    new PurchaseError("MISSING_REQUIRED_ATTACHMENT", `${role} attachment is mandatory for this workflow step.`),

  lockedPeriod: (month: string) =>
    new PurchaseError("LOCKED_FINANCIAL_PERIOD", `Financial period ${month} is locked. Transactions cannot be posted.`, 403),

  directIndentReasonRequired: () =>
    new PurchaseError("DIRECT_INDENT_REASON_REQUIRED", "Direct Indent (without source MR) requires a mandatory justification reason."),

  poAmendmentConflict: (reason: string) =>
    new PurchaseError("PO_AMENDMENT_CONFLICT", reason, 409),

  documentSequenceError: (docType: string) =>
    new PurchaseError("DOCUMENT_SEQUENCE_ERROR", `Failed to generate sequence for ${docType}. Retry or contact admin.`, 500),

  stockValidationFailed: (item: string, available: number, requested: number) =>
    new PurchaseError("STOCK_VALIDATION_FAILED", `Insufficient stock for ${item}: available ${available}, requested ${requested}.`),

  nonL1JustificationRequired: () =>
    new PurchaseError("NON_L1_JUSTIFICATION_REQUIRED", "Non-L1 vendor selected. Justification is mandatory."),

  sourceIndentRequired: () =>
    new PurchaseError("SOURCE_INDENT_REQUIRED", "Purchase Order requires a source Indent reference."),

  indentNotApproved: (status: string) =>
    new PurchaseError("INDENT_NOT_APPROVED", `Indent status "${status}" is not eligible for PO creation. L3 approval required.`),

  indentQtyExceeded: (item: string, poQty: number, openQty: number) =>
    new PurchaseError("INDENT_QTY_EXCEEDED", `PO qty (${poQty}) exceeds Indent open qty (${openQty}) for ${item}.`),

  sourcePoRequired: () =>
    new PurchaseError("SOURCE_PO_REQUIRED", "GRN requires a source PO reference."),

  poNotEligibleForGRN: (status: string) =>
    new PurchaseError("PO_NOT_ELIGIBLE_FOR_GRN", `PO status "${status}" is not eligible for GRN.`),

  invalidRejectionQty: (item: string, rejected: number, received: number) =>
    new PurchaseError("INVALID_REJECTION_QTY", `Rejected qty (${rejected}) cannot exceed received qty (${received}) for ${item}.`),

  requiredByDateInvalid: (reason: string) =>
    new PurchaseError("REQUIRED_BY_DATE_INVALID", reason),
};
