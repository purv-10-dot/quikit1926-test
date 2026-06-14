import { describe, it, expect } from "vitest";
import {
  invoiceCreateSchema,
  invoiceFromRabSchema,
  receiptCreateSchema,
  billCreateSchema,
  creditNoteSchema,
  debitNoteSchema,
  paymentCreateSchema,
} from "@/lib/schemas/finance";

describe("invoiceCreateSchema", () => {
  const valid = {
    invoiceNumber: "INV-1",
    customerId: "c1",
    invoiceDate: "2025-01-01",
    total: 1000,
  };
  it("parses valid and applies defaults (subtotal 0, lines [])", () => {
    const r = invoiceCreateSchema.parse(valid);
    expect(r.subtotal).toBe(0);
    expect(r.lines).toEqual([]);
  });
  it("requires customerId and total", () => {
    expect(invoiceCreateSchema.safeParse({ ...valid, customerId: "" }).success).toBe(false);
    const { total, ...rest } = valid;
    expect(invoiceCreateSchema.safeParse(rest).success).toBe(false);
  });
  it("rejects a line whose amount is negative", () => {
    const bad = { ...valid, lines: [{ description: "x", amount: -5 }] };
    expect(invoiceCreateSchema.safeParse(bad).success).toBe(false);
  });
});

describe("invoiceFromRabSchema", () => {
  it("requires invoiceNumber + invoiceDate", () => {
    expect(invoiceFromRabSchema.safeParse({ invoiceNumber: "I1", invoiceDate: "2025-01-01" }).success).toBe(true);
    expect(invoiceFromRabSchema.safeParse({ invoiceNumber: "I1" }).success).toBe(false);
  });
});

describe("receiptCreateSchema", () => {
  const valid = {
    receiptNumber: "RC-1",
    customerId: "c1",
    receiptDate: "2025-01-01",
    amount: 500,
    mode: "bank",
  };
  it("parses valid + defaults allocations []", () => {
    expect(receiptCreateSchema.parse(valid).allocations).toEqual([]);
  });
  it("requires a positive amount and valid mode", () => {
    expect(receiptCreateSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(receiptCreateSchema.safeParse({ ...valid, mode: "crypto" }).success).toBe(false);
  });
});

describe("billCreateSchema", () => {
  const valid = {
    billNumber: "BILL-1",
    vendorId: "v1",
    billDate: "2025-01-01",
    total: 2000,
  };
  it("parses valid", () => {
    expect(billCreateSchema.safeParse(valid).success).toBe(true);
  });
  it("requires vendorId", () => {
    expect(billCreateSchema.safeParse({ ...valid, vendorId: "" }).success).toBe(false);
  });
});

describe("creditNoteSchema / debitNoteSchema", () => {
  it("credit note requires customerId + reason + positive amount", () => {
    const ok = { noteNumber: "CN-1", customerId: "c1", noteDate: "2025-01-01", amount: 10, reason: "overcharge" };
    expect(creditNoteSchema.safeParse(ok).success).toBe(true);
    expect(creditNoteSchema.safeParse({ ...ok, amount: 0 }).success).toBe(false);
    expect(creditNoteSchema.safeParse({ ...ok, reason: "" }).success).toBe(false);
  });
  it("debit note requires vendorId", () => {
    const ok = { noteNumber: "DN-1", vendorId: "v1", noteDate: "2025-01-01", amount: 10, reason: "shortfall" };
    expect(debitNoteSchema.safeParse(ok).success).toBe(true);
    expect(debitNoteSchema.safeParse({ ...ok, vendorId: "" }).success).toBe(false);
  });
});

describe("paymentCreateSchema", () => {
  const valid = {
    paymentNumber: "PAY-1",
    vendorId: "v1",
    paymentDate: "2025-01-01",
    amount: 100,
    mode: "upi",
  };
  it("parses valid + defaults allocations []", () => {
    expect(paymentCreateSchema.parse(valid).allocations).toEqual([]);
  });
  it("validates allocation amounts are positive", () => {
    const bad = { ...valid, allocations: [{ billId: "b1", amount: 0 }] };
    expect(paymentCreateSchema.safeParse(bad).success).toBe(false);
  });
});
