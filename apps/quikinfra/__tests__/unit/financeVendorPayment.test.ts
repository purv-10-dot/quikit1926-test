import { describe, it, expect } from "vitest";
import {
  createVendorPayment,
  listVendorPayments,
} from "@/lib/finance/vendor-payment-service";

// `@/lib/http/errors` (DomainError) is mocked faithfully in setup.ts.
// The service holds an in-memory module-level `store`, so records created in
// one test persist for later tests in this file — assertions account for that.

const ctx: any = { orgId: "org-1", userId: "user-1" };

function input(over: Partial<Record<string, unknown>> = {}) {
  return {
    vendor: "Acme",
    poRef: "PO-1",
    invoiceNo: "INV-1",
    invoiceAmount: 10_000,
    tdsSection: "194C",
    tdsRate: 2,
    ...over,
  } as any;
}

describe("createVendorPayment — TDS / net math", () => {
  it("computes tdsDeducted = round(amount * rate / 100) and netPayable", async () => {
    const rec = await createVendorPayment(ctx, input({ invoiceNo: "INV-MATH-1", invoiceAmount: 10_000, tdsRate: 2 }));
    expect(rec.tdsDeducted).toBe(200);
    expect(rec.netPayable).toBe(9_800);
    expect(rec.invoiceAmount).toBe(10_000);
    expect(rec.tdsRate).toBe(2);
  });

  it("rounds the TDS to the nearest rupee", async () => {
    // 12345 * 2.5% = 308.625 -> rounds to 309
    const rec = await createVendorPayment(ctx, input({ invoiceNo: "INV-MATH-2", invoiceAmount: 12_345, tdsRate: 2.5 }));
    expect(rec.tdsDeducted).toBe(309);
    expect(rec.netPayable).toBe(12_345 - 309);
  });

  it("handles a 0% TDS rate (full net payable)", async () => {
    const rec = await createVendorPayment(ctx, input({ invoiceNo: "INV-MATH-3", invoiceAmount: 5_000, tdsRate: 0 }));
    expect(rec.tdsDeducted).toBe(0);
    expect(rec.netPayable).toBe(5_000);
  });

  it("coerces string numeric inputs via Number()", async () => {
    const rec = await createVendorPayment(ctx, input({ invoiceNo: "INV-MATH-4", invoiceAmount: "8000" as any, tdsRate: "10" as any }));
    expect(rec.tdsDeducted).toBe(800);
    expect(rec.netPayable).toBe(7_200);
  });
});

describe("createVendorPayment — record shape", () => {
  it("assigns an id, a VP-YYYY-### payment number, defaults + Pending status", async () => {
    const rec = await createVendorPayment(ctx, input({ invoiceNo: "INV-SHAPE-1", vendor: "ShapeVendor" }));
    expect(rec.id).toMatch(/^vp-\d+$/);
    expect(rec.paymentNo).toMatch(/^VP-\d{4}-\d{3}$/);
    expect(rec.status).toBe("Pending");
    expect(rec.paymentDate).toBe("");
    expect(rec.utrNo).toBe("");
    expect(rec.paymentMode).toBe(""); // defaulted
    expect(rec.bank).toBe("");        // defaulted
  });

  it("keeps provided paymentMode / bank", async () => {
    const rec = await createVendorPayment(
      ctx,
      input({ invoiceNo: "INV-SHAPE-2", paymentMode: "NEFT", bank: "HDFC" }),
    );
    expect(rec.paymentMode).toBe("NEFT");
    expect(rec.bank).toBe("HDFC");
  });
});

describe("createVendorPayment — duplicate guard", () => {
  it("throws CONFLICT (409) for the same invoiceNo + vendor", async () => {
    await createVendorPayment(ctx, input({ invoiceNo: "INV-DUP", vendor: "DupVendor" }));
    try {
      await createVendorPayment(ctx, input({ invoiceNo: "INV-DUP", vendor: "DupVendor" }));
      throw new Error("should have thrown");
    } catch (e: unknown) {
      const err = e as { code: string; httpStatus: number; message: string };
      expect(err.code).toBe("CONFLICT");
      expect(err.httpStatus).toBe(409);
      expect(err.message).toContain("INV-DUP");
    }
  });

  it("allows the same invoiceNo for a DIFFERENT vendor", async () => {
    await createVendorPayment(ctx, input({ invoiceNo: "INV-SHARED", vendor: "VendorX" }));
    const rec = await createVendorPayment(ctx, input({ invoiceNo: "INV-SHARED", vendor: "VendorY" }));
    expect(rec.vendor).toBe("VendorY");
  });
});

describe("listVendorPayments — search filter", () => {
  it("returns the record after creating it (no search)", async () => {
    await createVendorPayment(ctx, input({ invoiceNo: "INV-LIST-1", vendor: "Findable" }));
    const all = await listVendorPayments(ctx, {});
    expect(all.some((r) => r.invoiceNo === "INV-LIST-1")).toBe(true);
  });

  it("filters case-insensitively across paymentNo / vendor / invoiceNo", async () => {
    await createVendorPayment(ctx, input({ invoiceNo: "INV-UNIQUEHIT-XYZ", vendor: "Whatever" }));
    const byInvoice = await listVendorPayments(ctx, { search: "uniquehit" });
    expect(byInvoice.length).toBe(1);
    expect(byInvoice[0]!.invoiceNo).toBe("INV-UNIQUEHIT-XYZ");

    const byVendor = await listVendorPayments(ctx, { search: "WHATEVER" });
    expect(byVendor.some((r) => r.vendor === "Whatever")).toBe(true);
  });

  it("returns empty when nothing matches the search", async () => {
    const res = await listVendorPayments(ctx, { search: "no-such-record-zzz" });
    expect(res).toEqual([]);
  });
});
