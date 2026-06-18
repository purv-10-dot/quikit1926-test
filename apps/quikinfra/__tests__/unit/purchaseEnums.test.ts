import { describe, it, expect } from "vitest";
import {
  MRStatus,
  IndentStatus,
  POStatus,
  GRNStatus,
  StockCheckStatus,
  QuotationRank,
  isIndentApprovedForPO,
  isPOEligibleForGRN,
  MR_TRANSITIONS,
  INDENT_TRANSITIONS,
  PO_TRANSITIONS,
  STATUS_BADGE_COLORS,
} from "@/lib/purchase/enums";

describe("enum literal values", () => {
  it("MRStatus carries the canonical string values", () => {
    expect(MRStatus.DRAFT).toBe("draft");
    expect(MRStatus.SUBMITTED).toBe("submitted");
    expect(MRStatus.APPROVED_FOR_STOCK_ISSUE).toBe("approved_stock_available");
    expect(MRStatus.APPROVED_FOR_INDENT).toBe("approved_indent_required");
    expect(MRStatus.FULLY_SERVED).toBe("fully_served");
    expect(MRStatus.REJECTED).toBe("rejected");
  });

  it("IndentStatus L3 approval literal is l3_approved", () => {
    expect(IndentStatus.APPROVED_L3).toBe("l3_approved");
    expect(IndentStatus.APPROVED_L2).toBe("approved_l2");
    expect(IndentStatus.SUBMITTED_L1).toBe("submitted_l1");
    expect(IndentStatus.CANCELLED).toBe("cancelled");
  });

  it("POStatus + GRNStatus share the literal 'approved'", () => {
    expect(POStatus.APPROVED).toBe("approved");
    expect(GRNStatus.APPROVED).toBe("approved");
    expect(POStatus.FULLY_RECEIVED).toBe("fully_received");
  });

  it("StockCheckStatus + QuotationRank values", () => {
    expect(StockCheckStatus.AVAILABLE).toBe("AVAILABLE");
    expect(StockCheckStatus.INSUFFICIENT).toBe("INSUFFICIENT");
    expect(QuotationRank.L1).toBe("L1");
    expect(QuotationRank.UNRANKED).toBe("unranked");
  });
});

describe("isIndentApprovedForPO", () => {
  it("accepts the canonical l3_approved literal", () => {
    expect(isIndentApprovedForPO(IndentStatus.APPROVED_L3)).toBe(true);
    expect(isIndentApprovedForPO("l3_approved")).toBe(true);
  });

  it("accepts the documented aliases", () => {
    expect(isIndentApprovedForPO("approved")).toBe(true);
    expect(isIndentApprovedForPO("l3approved")).toBe(true);
  });

  it("rejects non-final states", () => {
    expect(isIndentApprovedForPO(IndentStatus.DRAFT)).toBe(false);
    expect(isIndentApprovedForPO(IndentStatus.APPROVED_L2)).toBe(false);
    expect(isIndentApprovedForPO("rejected_l3")).toBe(false);
    expect(isIndentApprovedForPO("")).toBe(false);
  });
});

describe("isPOEligibleForGRN", () => {
  it("accepts approved / dispatched / partially_received", () => {
    expect(isPOEligibleForGRN(POStatus.APPROVED)).toBe(true);
    expect(isPOEligibleForGRN(POStatus.DISPATCHED)).toBe(true);
    expect(isPOEligibleForGRN(POStatus.PARTIALLY_RECEIVED)).toBe(true);
  });

  it("rejects draft / fully_received / cancelled / unknown", () => {
    expect(isPOEligibleForGRN(POStatus.DRAFT)).toBe(false);
    expect(isPOEligibleForGRN(POStatus.FULLY_RECEIVED)).toBe(false);
    expect(isPOEligibleForGRN(POStatus.CANCELLED)).toBe(false);
    expect(isPOEligibleForGRN("nonsense")).toBe(false);
  });
});

describe("transition maps", () => {
  it("MR draft → submitted only", () => {
    expect(MR_TRANSITIONS[MRStatus.DRAFT]).toEqual([MRStatus.SUBMITTED]);
  });

  it("MR submitted fans out to the approval/reject set", () => {
    expect(MR_TRANSITIONS[MRStatus.SUBMITTED]).toContain(MRStatus.APPROVED_FOR_STOCK_ISSUE);
    expect(MR_TRANSITIONS[MRStatus.SUBMITTED]).toContain(MRStatus.REJECTED);
  });

  it("Indent climbs L1 → L2 → L3", () => {
    expect(INDENT_TRANSITIONS[IndentStatus.SUBMITTED_L1]).toContain(IndentStatus.APPROVED_L2);
    expect(INDENT_TRANSITIONS[IndentStatus.APPROVED_L2]).toContain(IndentStatus.APPROVED_L3);
  });

  it("PO approved can dispatch / receive / amend / close", () => {
    const next = PO_TRANSITIONS[POStatus.APPROVED];
    expect(next).toContain(POStatus.DISPATCHED);
    expect(next).toContain(POStatus.PARTIALLY_RECEIVED);
    expect(next).toContain(POStatus.UNDER_AMENDMENT);
    expect(next).toContain(POStatus.CLOSED);
  });

  it("rejected states route back to draft", () => {
    expect(MR_TRANSITIONS[MRStatus.REJECTED]).toEqual([MRStatus.DRAFT]);
    expect(INDENT_TRANSITIONS[IndentStatus.REJECTED_L2]).toEqual([IndentStatus.DRAFT]);
    expect(PO_TRANSITIONS[POStatus.REJECTED]).toEqual([POStatus.DRAFT]);
  });
});

describe("STATUS_BADGE_COLORS", () => {
  it("maps known statuses to tailwind classes", () => {
    expect(STATUS_BADGE_COLORS[MRStatus.DRAFT]).toBe("bg-gray-100 text-gray-600");
    expect(STATUS_BADGE_COLORS[POStatus.APPROVED]).toBe("bg-green-100 text-green-700");
    expect(STATUS_BADGE_COLORS[MRStatus.REJECTED]).toBe("bg-red-100 text-red-700");
  });
});
