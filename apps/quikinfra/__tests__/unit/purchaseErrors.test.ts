import { describe, it, expect } from "vitest";
import { PurchaseError, Errors } from "@/lib/purchase/errors";

describe("PurchaseError", () => {
  it("carries code / httpStatus (default 400) / message / name", () => {
    const e = new PurchaseError("SOME_CODE", "boom");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("SOME_CODE");
    expect(e.httpStatus).toBe(400);
    expect(e.message).toBe("boom");
    expect(e.name).toBe("PurchaseError");
    expect(e.details).toBeUndefined();
  });

  it("accepts an explicit httpStatus + details", () => {
    const e = new PurchaseError("X", "msg", 409, { field: "qty" });
    expect(e.httpStatus).toBe(409);
    expect(e.details).toEqual({ field: "qty" });
  });

  it("toJSON serializes to { error, code } and omits details when absent", () => {
    const e = new PurchaseError("X", "msg");
    expect(e.toJSON()).toEqual({ error: "msg", code: "X" });
  });

  it("toJSON includes details when present", () => {
    const e = new PurchaseError("X", "msg", 400, { a: 1 });
    expect(e.toJSON()).toEqual({ error: "msg", code: "X", details: { a: 1 } });
  });
});

describe("Errors factory — codes + statuses", () => {
  it("invalidWorkflowState → 409, lists expected states in the message", () => {
    const e = Errors.invalidWorkflowState("draft", ["submitted", "approved"]);
    expect(e.code).toBe("INVALID_WORKFLOW_STATE");
    expect(e.httpStatus).toBe(409);
    expect(e.message).toContain("draft");
    expect(e.message).toContain("submitted, approved");
  });

  it("approvalRequired → 403", () => {
    const e = Errors.approvalRequired("L2");
    expect(e.code).toBe("APPROVAL_REQUIRED");
    expect(e.httpStatus).toBe(403);
    expect(e.message).toContain("L2");
  });

  it("overReceiptNotAllowed → 400 (default) with qty values", () => {
    const e = Errors.overReceiptNotAllowed("Cement", 120, 100);
    expect(e.code).toBe("OVER_RECEIPT_NOT_ALLOWED");
    expect(e.httpStatus).toBe(400);
    expect(e.message).toContain("120");
    expect(e.message).toContain("100");
    expect(e.message).toContain("Cement");
  });

  it("lockedPeriod → 403", () => {
    const e = Errors.lockedPeriod("2026-06");
    expect(e.code).toBe("LOCKED_FINANCIAL_PERIOD");
    expect(e.httpStatus).toBe(403);
    expect(e.message).toContain("2026-06");
  });

  it("documentSequenceError → 500", () => {
    const e = Errors.documentSequenceError("PO");
    expect(e.code).toBe("DOCUMENT_SEQUENCE_ERROR");
    expect(e.httpStatus).toBe(500);
  });

  it("poAmendmentConflict → 409 with the raw reason", () => {
    const e = Errors.poAmendmentConflict("already amended");
    expect(e.code).toBe("PO_AMENDMENT_CONFLICT");
    expect(e.httpStatus).toBe(409);
    expect(e.message).toBe("already amended");
  });

  it("stockValidationFailed → 400 with available/requested", () => {
    const e = Errors.stockValidationFailed("Sand", 5, 20);
    expect(e.code).toBe("STOCK_VALIDATION_FAILED");
    expect(e.httpStatus).toBe(400);
    expect(e.message).toContain("available 5");
    expect(e.message).toContain("requested 20");
  });

  it("indentNotApproved → 400 echoes the offending status", () => {
    const e = Errors.indentNotApproved("approved_l2");
    expect(e.code).toBe("INDENT_NOT_APPROVED");
    expect(e.message).toContain("approved_l2");
  });

  it("indentQtyExceeded → 400 with po/open qty", () => {
    const e = Errors.indentQtyExceeded("Steel", 50, 30);
    expect(e.code).toBe("INDENT_QTY_EXCEEDED");
    expect(e.message).toContain("50");
    expect(e.message).toContain("30");
  });

  it("every factory produces an instanceof PurchaseError", () => {
    const all = [
      Errors.invalidWorkflowState("a", ["b"]),
      Errors.approvalRequired("L1"),
      Errors.blacklistedVendor("V"),
      Errors.missingAttachment("invoice"),
      Errors.directIndentReasonRequired(),
      Errors.nonL1JustificationRequired(),
      Errors.sourceIndentRequired(),
      Errors.sourcePoRequired(),
      Errors.poNotEligibleForGRN("draft"),
      Errors.invalidRejectionQty("X", 5, 3),
      Errors.requiredByDateInvalid("past date"),
    ];
    for (const e of all) {
      expect(e).toBeInstanceOf(PurchaseError);
      expect(typeof e.code).toBe("string");
      expect(typeof e.httpStatus).toBe("number");
    }
  });
});
