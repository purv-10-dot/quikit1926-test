/**
 * Purchase Service — P0 Production-Grade Business Rules
 *
 * This service layer enforces ALL procurement chain rules from the PRD.
 * It sits between API routes and the data layer (demo-store or Prisma).
 *
 * P0 RULES ENFORCED:
 * 1. PO requires L3-approved Indent (SOURCE_INDENT_REQUIRED, INDENT_NOT_APPROVED)
 * 2. PO line qty <= Indent line qtyOpen (INDENT_QTY_EXCEEDED)
 * 3. Blacklisted vendor blocked (BLACKLISTED_VENDOR)
 * 4. GRN requires eligible PO (SOURCE_PO_REQUIRED, PO_NOT_ELIGIBLE_FOR_GRN)
 * 5. GRN hard rejects over-receipt (OVER_RECEIPT_NOT_ALLOWED)
 * 6. GRN requires challan (MISSING_REQUIRED_ATTACHMENT)
 * 7. Direct Indent requires reason (DIRECT_INDENT_REASON_REQUIRED)
 * 8. MR requiredByDate >= mrDate, urgent if <= mrDate + 2 days
 * 9. PO finance: materialValue + freight = poValueExGst, no double-counting
 * 10. PO Amendment: qty >= received, no vendor change after GRN, no retro rate change
 */

// ─── Error Codes ────────────────────────────────────────────────────

export class PurchaseValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "PurchaseValidationError";
  }
}

export const ERR = {
  SOURCE_INDENT_REQUIRED: "SOURCE_INDENT_REQUIRED",
  INDENT_NOT_FOUND: "INDENT_NOT_FOUND",
  INDENT_NOT_APPROVED: "INDENT_NOT_APPROVED",
  INDENT_QTY_EXCEEDED: "INDENT_QTY_EXCEEDED",
  BLACKLISTED_VENDOR: "BLACKLISTED_VENDOR",
  INVALID_WORKFLOW_STATE: "INVALID_WORKFLOW_STATE",
  SOURCE_PO_REQUIRED: "SOURCE_PO_REQUIRED",
  PO_NOT_FOUND: "PO_NOT_FOUND",
  PO_NOT_ELIGIBLE_FOR_GRN: "PO_NOT_ELIGIBLE_FOR_GRN",
  OVER_RECEIPT_NOT_ALLOWED: "OVER_RECEIPT_NOT_ALLOWED",
  INVALID_REJECTION_QTY: "INVALID_REJECTION_QTY",
  MISSING_REQUIRED_ATTACHMENT: "MISSING_REQUIRED_ATTACHMENT",
  DIRECT_INDENT_REASON_REQUIRED: "DIRECT_INDENT_REASON_REQUIRED",
  PO_AMENDMENT_CONFLICT: "PO_AMENDMENT_CONFLICT",
  REQUIRED_BY_DATE_INVALID: "REQUIRED_BY_DATE_INVALID",
} as const;

// ─── MR Validation (P0 Fix #12) ────────────────────────────────────

export function validateMRDates(mrDate: string, requiredByDate: string): { isUrgent: boolean } {
  const mr = new Date(mrDate);
  const req = new Date(requiredByDate);

  if (isNaN(req.getTime())) throw new PurchaseValidationError(ERR.REQUIRED_BY_DATE_INVALID, "Required By Date is invalid");
  if (req < mr) throw new PurchaseValidationError(ERR.REQUIRED_BY_DATE_INVALID, "Required By Date must be >= MR Date");

  // Urgent if <= mrDate + 2 days
  const twoDaysLater = new Date(mr);
  twoDaysLater.setDate(twoDaysLater.getDate() + 2);
  return { isUrgent: req <= twoDaysLater };
}

// ─── Indent Validation (P0 Fix #9) ─────────────────────────────────

export function validateIndentCreation(body: any): void {
  if (!body.sourceMrId && !body.directIndentReason?.trim()) {
    throw new PurchaseValidationError(
      ERR.DIRECT_INDENT_REASON_REQUIRED,
      "Direct Indent (without source MR) requires a mandatory justification reason."
    );
  }
}

// ─── PO Validation (P0 Fixes #2, #3, #4, #8) ──────────────────────

export interface IndentForPO {
  id: string;
  status: string;
  lines: Array<{ lineId: string; itemId: string; qtyRequested: number; qtyOpen: number }>;
}

export interface VendorForPO {
  id: string;
  status: string;
  isBlacklisted?: boolean;
}

const INDENT_APPROVED_STATUSES = new Set(["l3_approved", "approved", "l3approved"]);

export function validatePOCreation(body: any, indent: IndentForPO | null, vendor: VendorForPO | null): void {
  const isUrgentLocal =
    body.isUrgentLocal === true || body.isUrgentLocal === "true";

  // Vendor checks run for BOTH standard and urgent flows — even an
  // emergency local purchase must go through a non-blacklisted vendor.
  if (!vendor) {
    throw new PurchaseValidationError(ERR.BLACKLISTED_VENDOR, "Vendor not found.");
  }
  if (vendor.status === "blacklisted" || vendor.isBlacklisted) {
    throw new PurchaseValidationError(ERR.BLACKLISTED_VENDOR, "Cannot create PO for a blacklisted vendor.");
  }

  // Urgent Local PO bypasses the Indent / RFQ chain — site needs a
  // material immediately and there's no time for the formal flow.
  // Buyer signals this by ticking the "Urgent Local" toggle on the
  // drawer; we trust that flag here and skip the source-doc rules.
  if (isUrgentLocal) return;

  // P0 Fix #3: sourceIndentId mandatory (standard flow only)
  if (!body.sourceIndentId) {
    throw new PurchaseValidationError(ERR.SOURCE_INDENT_REQUIRED, "Purchase Order requires a source Indent reference. PO cannot be created without an approved Indent.");
  }

  // P0 Fix #2: Indent must exist and be L3-approved
  if (!indent) {
    throw new PurchaseValidationError(ERR.INDENT_NOT_FOUND, `Indent ${body.sourceIndentId} not found.`);
  }
  if (!INDENT_APPROVED_STATUSES.has(indent.status)) {
    throw new PurchaseValidationError(ERR.INDENT_NOT_APPROVED, `Indent status is "${indent.status}". Only L3-approved Indents can create POs.`);
  }

  // P0 Fix #4: At least one line with qtyOpen > 0
  const hasOpenQty = indent.lines.some(l => l.qtyOpen > 0);
  if (!hasOpenQty) {
    throw new PurchaseValidationError(ERR.INDENT_QTY_EXCEEDED, "All Indent lines are fully served (qtyOpen = 0). No PO can be created.");
  }

  // P0 Fix #4: PO line qty <= Indent line qtyOpen
  if (body.lines) {
    for (const poLine of body.lines) {
      const indentLine = indent.lines.find(il => il.lineId === poLine.indentLineId || il.itemId === poLine.itemId);
      if (indentLine) {
        const poQty = parseFloat(poLine.poQty ?? poLine.quantity ?? "0");
        if (poQty > indentLine.qtyOpen) {
          throw new PurchaseValidationError(
            ERR.INDENT_QTY_EXCEEDED,
            `PO qty (${poQty}) exceeds Indent open qty (${indentLine.qtyOpen}) for item ${poLine.itemId}. Reduce PO quantity.`
          );
        }
      }
    }
  }
}

// ─── PO Finance Calculation (P0 Fix #8) ─────────────────────────────

export interface POLineCalc {
  qty: number;
  unitRate: number;
  discountPct: number;
  gstRate: number;
  igstRate: number;
  cgstRate: number;
  sgstRate: number;
}

export function calculatePOFinance(lines: POLineCalc[], freightCharges: number) {
  let materialValueExGst = 0;
  let totalIGST = 0;
  let totalCGST = 0;
  let totalSGST = 0;

  const computedLines = lines.map(line => {
    const netValue = line.qty * line.unitRate * (1 - line.discountPct / 100);
    const igst = netValue * line.igstRate / 100;
    const cgst = netValue * line.cgstRate / 100;
    const sgst = netValue * line.sgstRate / 100;
    materialValueExGst += netValue;
    totalIGST += igst;
    totalCGST += cgst;
    totalSGST += sgst;
    return { netValue: round2(netValue), igst: round2(igst), cgst: round2(cgst), sgst: round2(sgst) };
  });

  const totalGstAmount = round2(totalIGST + totalCGST + totalSGST);
  // P0 Fix #8: freight added ONCE to poValueExGst, NOT to materialValue
  const poValueExGst = round2(materialValueExGst + freightCharges);
  const poTotalIncGst = round2(poValueExGst + totalGstAmount);

  return {
    materialValueExGst: round2(materialValueExGst),
    freightCharges: round2(freightCharges),
    poValueExGst,
    totalIGST: round2(totalIGST),
    totalCGST: round2(totalCGST),
    totalSGST: round2(totalSGST),
    totalGstAmount,
    poTotalIncGst,
    computedLines,
  };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

// ─── GRN Validation (P0 Fixes #4, #5, #9, #11) ────────────────────

export interface POForGRN {
  id: string;
  status: string;
  lines: Array<{ lineId: string; itemId: string; poQty: number; qtyReceived: number; qtyPending: number }>;
}

// `sent` was added because the PO submit flow now flips the status
// to `sent` after the PDF email goes out — if we didn't accept it
// here, an approved PO that was emailed to the vendor would refuse
// any further GRN (the exact moment GRNs start being relevant).
const GRN_ELIGIBLE_PO_STATUSES = new Set([
  "approved",
  "sent",
  "dispatched",
  "partially_received",
]);

export function validateGRNCreation(body: any, po: POForGRN | null): void {
  // P0 Fix #4: PO required
  if (!body.poId && !body.sourcePoId) {
    throw new PurchaseValidationError(ERR.SOURCE_PO_REQUIRED, "GRN requires a source PO reference.");
  }

  if (!po) {
    throw new PurchaseValidationError(ERR.PO_NOT_FOUND, "PO not found.");
  }

  // PO must be in eligible status
  if (!GRN_ELIGIBLE_PO_STATUSES.has(po.status)) {
    throw new PurchaseValidationError(ERR.PO_NOT_ELIGIBLE_FOR_GRN, `PO status "${po.status}" is not eligible for GRN. PO must be Approved, Sent, Dispatched, or Partially Received.`);
  }

  // PO must have pending qty
  const hasPending = po.lines.some(l => l.qtyPending > 0);
  if (!hasPending) {
    throw new PurchaseValidationError(ERR.PO_NOT_ELIGIBLE_FOR_GRN, "PO has no pending quantity. All items are fully received.");
  }
}

export function validateGRNLines(grnLines: any[], poLines: POForGRN["lines"]): void {
  for (const grnLine of grnLines) {
    const poLine = poLines.find(pl => pl.lineId === grnLine.poLineId || pl.itemId === grnLine.itemId);
    if (!poLine) continue;

    const qtyReceived = parseFloat(grnLine.qtyReceived ?? "0");
    const qtyRejected = parseFloat(grnLine.qtyRejected ?? "0");

    if (qtyReceived < 0) throw new PurchaseValidationError(ERR.OVER_RECEIPT_NOT_ALLOWED, `Received qty cannot be negative for item ${grnLine.itemId}`);
    if (qtyRejected < 0) throw new PurchaseValidationError(ERR.INVALID_REJECTION_QTY, `Rejected qty cannot be negative for item ${grnLine.itemId}`);
    if (qtyRejected > qtyReceived) throw new PurchaseValidationError(ERR.INVALID_REJECTION_QTY, `Rejected qty (${qtyRejected}) cannot exceed received qty (${qtyReceived}) for item ${grnLine.itemId}`);

    const qtyAccepted = qtyReceived - qtyRejected;

    // P0 Fix #5: HARD REJECT over-receipt — NO silent capping
    if (qtyAccepted > poLine.qtyPending) {
      throw new PurchaseValidationError(
        ERR.OVER_RECEIPT_NOT_ALLOWED,
        `Accepted qty (${qtyAccepted}) exceeds PO pending qty (${poLine.qtyPending}) for item ${grnLine.itemId}. Reduce received quantity or increase rejected quantity.`
      );
    }
  }
}

export function validateGRNChallan(body: any): void {
  // P0 Fix #11: Challan mandatory before submit
  if (!body.challanNo?.trim()) {
    throw new PurchaseValidationError(ERR.MISSING_REQUIRED_ATTACHMENT, "Challan number is mandatory for GRN submission.");
  }
  if (!body.challanDate?.trim()) {
    throw new PurchaseValidationError(ERR.MISSING_REQUIRED_ATTACHMENT, "Challan date is mandatory for GRN submission.");
  }
  // Attachment check — in demo mode we check for a reference string
  // In production this checks file metadata table
  if (!body.challanAttachment && !body.challanAttachmentId) {
    throw new PurchaseValidationError(ERR.MISSING_REQUIRED_ATTACHMENT, "Challan attachment (scan/photo) is mandatory for GRN submission. Attach the delivery challan before submitting.");
  }
}

// ─── PO Amendment Validation (P0 Fix #10) ───────────────────────────

export function validatePOAmendment(
  amendment: any,
  originalPO: any,
  existingGRNs: any[]
): void {
  const hasGRNs = existingGRNs.length > 0;

  // Cannot change vendor if any GRN exists
  if (hasGRNs && amendment.vendorId && amendment.vendorId !== originalPO.vendorId) {
    throw new PurchaseValidationError(
      ERR.PO_AMENDMENT_CONFLICT,
      "Cannot change vendor on a PO that has existing GRNs. Cancel the PO and create a new one if vendor change is required."
    );
  }

  // Cannot reduce line qty below already received
  if (amendment.lines) {
    for (const amdLine of amendment.lines) {
      const origLine = originalPO.lines?.find((l: any) => l.lineId === amdLine.lineId || l.itemId === amdLine.itemId);
      if (!origLine) continue;

      const newQty = parseFloat(amdLine.revisedQty ?? amdLine.poQty ?? "0");
      const received = parseFloat(origLine.qtyReceived ?? "0");

      if (newQty < received) {
        throw new PurchaseValidationError(
          ERR.PO_AMENDMENT_CONFLICT,
          `Cannot reduce qty to ${newQty} — already received ${received} for item ${amdLine.itemId}. Amended qty must be >= received qty.`
        );
      }

      // Rate change after partial receipt — block in P0
      if (received > 0 && amdLine.revisedRate && parseFloat(amdLine.revisedRate) !== parseFloat(origLine.unitRate ?? "0")) {
        throw new PurchaseValidationError(
          ERR.PO_AMENDMENT_CONFLICT,
          `Cannot change rate for item ${amdLine.itemId} after partial receipt (${received} units already received). Rate changes on partially received lines require a debit/credit note (Phase 2).`
        );
      }
    }
  }
}

// ─── Demo Mode Flag (P0 Fix #1) ────────────────────────────────────

export function isDemoMode(): boolean {
  return process.env.ENABLE_DEMO_MODE === "true";
}
