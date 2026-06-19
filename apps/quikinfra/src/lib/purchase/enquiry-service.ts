/**
 * Phase 2 Scaffold: Vendor Enquiry + Quotation Comparison
 *
 * Schema + service + types ready for implementation.
 * Not fully wired to UI in this pass.
 */

import { EnquiryStatus, QuotationRank } from "./enums";

// ─── Enquiry Types ──────────────────────────────────────────────────

export interface VendorEnquiry {
  id: string;
  enquiryNumber: string;           // ENQ-{proj}-{FY}-{seq}
  indentId: string;                // Source indent (mandatory)
  projectId: string;
  projectName: string;
  enquiryDate: string;
  responseDeadline: string;
  vendorsInvited: string[];        // vendor IDs (2-5 vendors)
  status: EnquiryStatus;
  lines: EnquiryLine[];
  createdBy: string;
  createdAt: string;
}

export interface EnquiryLine {
  lineId: string;
  itemId: string;
  itemName: string;
  uomCode: string;
  quantity: number;
  qualitySpec: string;
}

// ─── Quotation Types ────────────────────────────────────────────────

export interface VendorQuotation {
  id: string;
  quotationNumber: string;         // QTN-{proj}-{FY}-{seq}
  enquiryId: string;
  vendorId: string;
  vendorName: string;
  quotationDate: string;
  validUntil: string;
  deliveryDaysCommitted: number;
  paymentTerms: string;
  totalQuotedValue: number;
  rank: QuotationRank;             // Auto-calculated L1/L2/L3
  attachment: string;              // File reference
  lines: QuotationLine[];
  status: "submitted" | "evaluated" | "selected" | "rejected";
}

export interface QuotationLine {
  lineId: string;
  enquiryLineId: string;
  itemId: string;
  unitRate: number;
  lineTotal: number;
}

// ─── Comparison Types ───────────────────────────────────────────────

export interface QuotationComparison {
  enquiryId: string;
  items: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    vendorRates: Array<{
      vendorId: string;
      vendorName: string;
      unitRate: number;
      lineTotal: number;
      rank: QuotationRank;
      deliveryDays: number;
      paymentTerms: string;
    }>;
  }>;
  selectedVendorId: string | null;
  nonL1Justification: string | null;   // Required if selected vendor is not L1
}

// ─── Service ────────────────────────────────────────────────────────

export class EnquiryService {
  /**
   * Auto-rank quotations by total value.
   * L1 = lowest, L2 = second, L3 = third.
   */
  rankQuotations(quotations: VendorQuotation[]): VendorQuotation[] {
    const sorted = [...quotations].sort((a, b) => a.totalQuotedValue - b.totalQuotedValue);
    return sorted.map((q, i) => ({
      ...q,
      rank: i === 0 ? QuotationRank.L1 : i === 1 ? QuotationRank.L2 : i === 2 ? QuotationRank.L3 : QuotationRank.UNRANKED,
    }));
  }

  /**
   * Validate vendor selection.
   * If non-L1 vendor selected, justification is mandatory.
   */
  validateVendorSelection(
    selectedVendorId: string,
    rankedQuotations: VendorQuotation[],
    justification: string | null
  ): { valid: boolean; error?: string } {
    const l1 = rankedQuotations.find(q => q.rank === QuotationRank.L1);
    if (l1 && l1.vendorId !== selectedVendorId && !justification?.trim()) {
      return {
        valid: false,
        error: "Non-L1 vendor selected. Justification is mandatory when selecting a vendor who is not the lowest bidder.",
      };
    }
    return { valid: true };
  }
}

export const enquiryService = new EnquiryService();
